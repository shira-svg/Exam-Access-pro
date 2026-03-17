import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import fs from "fs";
import admin from "firebase-admin";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = firebaseConfig.firestoreDatabaseId 
  ? (admin.app() as any).firestore(firebaseConfig.firestoreDatabaseId)
  : admin.firestore();

// Email Transporter Setup
const getSetting = async (key: string) => {
  try {
    // Check if db is initialized
    if (!db) return undefined;
    const doc = await db.collection("settings").doc(key).get();
    return doc.exists ? doc.data()?.value : undefined;
  } catch (e: any) {
    // If it's a NOT_FOUND error, it likely means the collection or database isn't ready yet
    if (e.code === 5 || (e.message && e.message.includes('NOT_FOUND'))) {
      return undefined;
    }
    console.error("Error getting setting:", e);
    return undefined;
  }
};

const createTransporter = async () => {
  let host = process.env.SMTP_HOST || await getSetting("SMTP_HOST");
  let portStr = process.env.SMTP_PORT || await getSetting("SMTP_PORT") || "587";
  let user = process.env.SMTP_USER || await getSetting("SMTP_USER");
  let pass = process.env.SMTP_PASS || await getSetting("SMTP_PASS");

  if (!host || !user || !pass) {
    console.warn("SMTP settings not fully configured. Emails will be logged to console instead of sent.");
    return null;
  }

  // Sanitize inputs to remove common copy-paste prefixes and whitespace
  host = host.replace(/^(SMTP_HOST:\s*|SMTP:\s*|smtp:\/\/)/i, '').trim();
  user = user.replace(/^(SMTP_USER:\s*|USER:\s*)/i, '').trim();
  pass = pass.replace(/^(SMTP_PASS:\s*|PASS:\s*|PASSWORD:\s*)/i, '').trim();
  const port = parseInt(portStr.toString().replace(/[^0-9]/g, ''));

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
};

const sendCodeEmail = async (email: string, code: string, credits: number) => {
  const transporter = await createTransporter();
  const user = process.env.SMTP_USER || await getSetting("SMTP_USER");
  const subject = "קוד הגישה החדש שלך למערכת המבחנים";
  const html = `
    <div dir="rtl" style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; rounded: 10px;">
      <h2 style="color: #4f46e5;">שלום!</h2>
      <p>תודה על הרכישה. הנה קוד הגישה החדש שלך:</p>
      <div style="background: #f8fafc; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <span style="font-family: monospace; font-size: 24px; font-weight: bold; color: #1e293b; letter-spacing: 2px;">${code}</span>
      </div>
      <p>הקוד מעניק לך <strong>${credits} מבחנים</strong> נוספים במערכת.</p>
      <p>כדי להשתמש בו, היכנסי לאפליקציה, לחצי על יתרת הקרדיטים שלך והדביקי את הקוד בתיבת "מימוש קוד".</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
      <p style="font-size: 12px; color: #64748b;">פיתוח שירה רוט זליקוביץ | <a href="https://www.lomdot.org/">לאתר שלי</a></p>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: `"מערכת המבחנים" <${user}>`,
        to: email,
        subject,
        html,
      });
      console.log(`Email sent successfully to ${email}`);
      return true;
    } catch (error) {
      console.error("Failed to send email:", error);
      return false;
    }
  } else {
    console.log("--- MOCK EMAIL ---");
    console.log(`To: ${email}`);
    console.log(`Subject: ${subject}`);
    console.log(`Code: ${code}`);
    console.log("------------------");
    return true;
  }
};

// Credit Renewal Logic
const checkAndRenewCredits = async (email: string) => {
  const normalizedEmail = email.toLowerCase().trim();
  const userRef = db.collection("users").doc(normalizedEmail);
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) return 0;
  const user = userDoc.data() as any;
  
  if ((user.subscription_type !== 'monthly' && user.subscription_type !== 'annual') || !user.monthly_allowance) return user.credits;

  const now = new Date();
  
  // Check if subscription has ended
  if (user.subscription_end_date) {
    const endDate = user.subscription_end_date.toDate ? user.subscription_end_date.toDate() : new Date(user.subscription_end_date);
    if (now > endDate) {
      await userRef.update({ subscription_type: 'free', monthly_allowance: 0 });
      return user.credits;
    }
  }

  const lastRenewal = user.last_renewal_date 
    ? (user.last_renewal_date.toDate ? user.last_renewal_date.toDate() : new Date(user.last_renewal_date)) 
    : new Date(0);
  
  // Calculate months passed since last renewal
  const diffTime = Math.abs(now.getTime() - lastRenewal.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const monthsToRenew = Math.floor(diffDays / 30);

  if (monthsToRenew > 0) {
    const newCredits = (user.credits || 0) + (user.monthly_allowance * monthsToRenew);
    await userRef.update({ 
      credits: newCredits, 
      last_renewal_date: admin.firestore.FieldValue.serverTimestamp() 
    });
    console.log(`Renewed ${user.monthly_allowance * monthsToRenew} credits for ${email}. New balance: ${newCredits}`);
    return newCredits;
  }

  return user.credits;
};

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  const PORT = parseInt(process.env.PORT || "3000");

  // Basic health check - should be available even if Vite fails
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV || 'development' });
  });

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.post("/api/auth/guest-login", async (req, res) => {
    try {
      const guestEmail = "guest@examaccess.pro";
      const guestName = "אורח במערכת";
      
      const userRef = db.collection("users").doc(guestEmail);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        const userData = { 
          email: guestEmail, 
          name: guestName, 
          credits: 10,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await userRef.set(userData);
        res.json(userData);
      } else {
        res.json(userDoc.data());
      }
    } catch (error) {
      res.status(500).json({ error: "Guest login failed" });
    }
  });

  app.post("/api/auth/verify", async (req, res) => {
    try {
      const { code } = req.body;
      console.log("Verifying code/email:", code);
      if (!code || typeof code !== 'string') return res.status(400).json({ error: "Valid code is required" });

      // Check if it's an email (Google Login)
      if (code.includes('@')) {
        const email = code.trim().toLowerCase();
        await checkAndRenewCredits(email);
        const userDoc = await db.collection("users").doc(email).get();
        if (userDoc.exists) {
          const user = userDoc.data() as any;
          console.log("User found by email:", user.email);
          return res.json({ 
            email: user.email, 
            name: user.name, 
            credits: user.credits, 
            code: email,
            subscriptionType: user.subscription_type || 'free'
          });
        }
        console.log("User not found by email:", email);
      }

      // For testing, if code is TEST123, we link it to test@shira.com
      if (code === "TEST123") {
        const userDoc = await db.collection("users").doc("test@shira.com").get();
        if (userDoc.exists) {
          const user = userDoc.data() as any;
          return res.json({ email: user.email, credits: user.credits, code: "TEST123" });
        }
      }

      // General check in access_codes
      const codeDoc = await db.collection("access_codes").doc(code).get();

      if (codeDoc.exists && !codeDoc.data()?.used) {
        const row = codeDoc.data() as any;
        // Ensure user exists for this code
        const email = `user-${code}@temp.com`;
        const userRef = db.collection("users").doc(email);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
          await userRef.set({ email, credits: row.credits, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        res.json({ email, credits: row.credits, code: row.code || code });
      } else {
        res.status(401).json({ error: "קוד גישה לא תקין או שכבר נוצל" });
      }
    } catch (error) {
      console.error("Error verifying code:", error);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  const getRedirectUri = (req: express.Request) => {
    // 1. Try to get origin from state or query parameter
    let origin = req.query.origin as string;
    
    // If we're in the callback, the origin might be in the state
    if (!origin && req.query.state) {
      try {
        const state = JSON.parse(req.query.state as string);
        origin = state.origin;
      } catch (e) {}
    }

    if (origin) {
      const uri = `${origin.replace(/\/$/, '')}/auth/callback`;
      return uri;
    }

    // 2. Try to get from APP_URL environment variable
    if (process.env.APP_URL) {
      const uri = `${process.env.APP_URL.replace(/\/$/, '')}/auth/callback`;
      return uri;
    }

    // 3. Fallback to host header
    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const uri = host ? `${protocol}://${host}/auth/callback` : 'http://localhost:3000/auth/callback';
    
    return uri;
  };

  app.get("/api/auth/google/url", (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(501).json({ error: "Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the Secrets panel." });
    }
    const origin = req.query.origin as string;
    const redirectUri = getRedirectUri(req);
    const state = JSON.stringify({ origin });
    
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      state: state
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, name } = req.body;
      if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

      const normalizedEmail = email.toLowerCase().trim();
      
      // Check if user exists
      const userRef = db.collection("users").doc(normalizedEmail);
      const userDoc = await userRef.get();
      if (userDoc.exists) return res.status(400).json({ error: "משתמש עם אימייל זה כבר קיים במערכת" });

      const hashedPassword = await bcrypt.hash(password, 10);
      
      await userRef.set({ 
        email: normalizedEmail, 
        name: name || '', 
        password_hash: hashedPassword, 
        credits: 5,
        subscription_type: 'free',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      res.json({ 
        success: true, 
        email: normalizedEmail, 
        name: name || '', 
        credits: 5,
        subscriptionType: 'free'
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login-password", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

      const normalizedEmail = email.toLowerCase().trim();
      await checkAndRenewCredits(normalizedEmail);
      const userDoc = await db.collection("users").doc(normalizedEmail).get();

      if (!userDoc.exists) {
        return res.status(401).json({ error: "אימייל או סיסמה לא נכונים" });
      }
      const user = userDoc.data() as any;

      if (!user.password_hash) {
        return res.status(401).json({ error: "אימייל או סיסמה לא נכונים" });
      }

      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: "אימייל או סיסמה לא נכונים" });
      }

      res.json({ 
        email: user.email, 
        name: user.name, 
        credits: user.credits,
        subscriptionType: user.subscription_type || 'free'
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(501).send("Google OAuth not configured");
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code as string,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: getRedirectUri(req),
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();
      
      if (!tokens.access_token) {
        console.error("Failed to get access token from Google:", tokens);
        return res.status(400).send("Authentication failed: Failed to get access token.");
      }

      // Get user info
      const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userInfo = await userResponse.json();
      console.log("Google userinfo response:", userInfo);
      
      if (!userInfo || typeof userInfo.email !== 'string') {
        console.error("Google userinfo missing or invalid email:", userInfo);
        return res.status(400).send("Authentication failed: No valid email provided by Google.");
      }
      
      const email = userInfo.email.toLowerCase().trim();
      const name = (userInfo.given_name || userInfo.name || 'User').toString();
      console.log("Google OAuth success for email:", email);

      // Ensure user exists in DB
      const userRef = db.collection("users").doc(email);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        await userRef.set({
          email,
          name,
          credits: 5,
          last_renewal_date: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        await userRef.update({ name });
      }
      
      await checkAndRenewCredits(email);
      console.log("User record ensured in DB for:", email);

      // Send success message to parent window
      res.send(`
        <html>
          <body>
            <script>
              const authData = { 
                type: 'OAUTH_AUTH_SUCCESS', 
                email: '${email}',
                name: '${name}',
                timestamp: Date.now()
              };
              
              // Try postMessage first
              if (window.opener) {
                window.opener.postMessage(authData, '*');
                setTimeout(() => window.close(), 100);
              } else {
                // Fallback to localStorage for cases where opener is null (e.g. iframes)
                localStorage.setItem('google_auth_success', JSON.stringify(authData));
                setTimeout(() => window.close(), 500);
              }
            </script>
            <div style="text-align: center; padding-top: 50px; font-family: sans-serif;">
              <h2 style="color: #0d9488;">התחברת בהצלחה!</h2>
              <p>החלון ייסגר מיד ותועבר לאתר...</p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("OAuth error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  app.post("/api/auth/user-info", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });

      await checkAndRenewCredits(email);
      const userDoc = await db.collection("users").doc(email.toLowerCase().trim()).get();

      if (userDoc.exists) {
        res.json(userDoc.data());
      } else {
        res.status(404).json({ error: "User not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user info" });
    }
  });

  app.post("/api/auth/redeem", async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) return res.status(400).json({ error: "Email and code are required" });

      const normalizedEmail = email.toLowerCase().trim();
      const codeRef = db.collection("access_codes").doc(code);
      const codeDoc = await codeRef.get();

      if (!codeDoc.exists) return res.status(404).json({ error: "קוד לא תקין" });
      const accessCode = codeDoc.data() as any;
      if (accessCode.used) return res.status(400).json({ error: "הקוד כבר נוצל" });

      await db.runTransaction(async (transaction) => {
        const userRef = db.collection("users").doc(normalizedEmail);
        const userDoc = await transaction.get(userRef);

        if (!userDoc.exists) {
          transaction.set(userRef, { 
            email: normalizedEmail, 
            credits: accessCode.credits,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          const currentCredits = userDoc.data()?.credits || 0;
          transaction.update(userRef, { credits: currentCredits + accessCode.credits });
        }

        transaction.update(codeRef, { 
          used: true, 
          usedBy: normalizedEmail, 
          usedAt: admin.firestore.FieldValue.serverTimestamp() 
        });
      });
      
      const updatedUserDoc = await db.collection("users").doc(normalizedEmail).get();
      res.json({ success: true, credits: updatedUserDoc.data()?.credits });
    } catch (error) {
      console.error("Redeem error:", error);
      res.status(500).json({ error: "Failed to redeem code" });
    }
  });

  app.post("/api/admin/update-credits", async (req, res) => {
    try {
      const { adminEmail, targetEmail, credits } = req.body;
      if (adminEmail !== "shiraroth.z@gmail.com" && adminEmail !== "shira@lomdot.org") {
        return res.status(403).json({ error: "Unauthorized" });
      }

      await db.collection("users").doc(targetEmail.toLowerCase().trim()).update({ credits });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating credits:", error);
      res.status(500).json({ error: "Failed to update credits" });
    }
  });

  app.get("/api/admin/users", async (req, res) => {
    try {
      const { email } = req.query;
      if (email !== "shiraroth.z@gmail.com" && email !== "shira@lomdot.org") {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const snapshot = await db.collection("users").orderBy("createdAt", "desc").get();
      const users = snapshot.docs.map(doc => doc.data());
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/add-credits", async (req, res) => {
    try {
      const { code, credits, secret } = req.body;
      const adminSecret = process.env.ADMIN_SECRET;

      if (!adminSecret || secret !== adminSecret) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      await db.collection("access_codes").doc(code).set({
        code,
        credits,
        used: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.json({ success: true, message: `Code ${code} created with ${credits} credits` });
    } catch (error) {
      console.error("Error adding credits:", error);
      res.status(500).json({ error: "Failed to add credits" });
    }
  });

  // Meshulam Webhook
  app.post("/api/webhooks/meshulam", async (req, res) => {
    try {
      console.log("Meshulam Webhook received:", req.body);
      
      // Meshulam parameters usually come in the body
      // We expect: status, sum, transaction_id, custom_fields (containing email)
      const { status, sum, transaction_id, custom_fields } = req.body;
      
      // status 1 usually means success in Meshulam
      if (status === "1" || status === 1) {
        let email = "";
        
        // Try to find email in various possible Meshulam fields
        if (req.body.email) email = req.body.email;
        else if (req.body.user_email) email = req.body.user_email;
        else if (req.body.customer_email) email = req.body.customer_email;
        else if (custom_fields) {
          try {
            const fields = typeof custom_fields === 'string' ? JSON.parse(custom_fields) : custom_fields;
            email = fields.email || fields.userEmail || (typeof fields === 'string' ? fields : "");
          } catch (e) {
            email = custom_fields;
          }
        }

        if (!email || typeof email !== 'string' || !email.includes('@')) {
          console.error("Webhook error: No valid email found in payload", req.body);
          return res.status(400).send("No valid email provided");
        }

        email = email.toLowerCase().trim();

        // Determine credits based on sum
        let creditsToGive = 0;
        let isMonthly = false;
        const amount = parseFloat(sum);
        
        if (amount === 35) { // Monthly Pro
          creditsToGive = 50;
          isMonthly = true;
        } else if (amount === 294) { // Annual Pro (70% of 35*12)
          creditsToGive = 50;
          isMonthly = true; // Still monthly allowance
        } else if (amount === 50) { // 50 tests package
          creditsToGive = 50;
        } else if (amount === 29) { // 20 tests package
          creditsToGive = 20;
        } else if (amount === 1) { // Test package
          creditsToGive = 5; // Giving 5 for the 1 NIS test as a bonus
        } else {
          // Fallback for any other amount
          creditsToGive = Math.floor(amount / 1.5); 
        }

        // Generate a unique code
        const newCode = `EXAM-${uuidv4().substring(0, 8).toUpperCase()}`;
        
        await db.runTransaction(async (transaction) => {
          // Save purchase
          const purchaseRef = db.collection("purchases").doc(uuidv4());
          transaction.set(purchaseRef, {
            email,
            amount,
            credits: creditsToGive,
            status: 'success',
            transaction_id,
            raw_data: JSON.stringify(req.body),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // Create access code (NOT auto-redeemed, user must enter it manually)
          const codeRef = db.collection("access_codes").doc(newCode);
          transaction.set(codeRef, {
            code: newCode,
            credits: creditsToGive,
            used: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          // If monthly, update user directly as well (Monthly is a subscription, usually tied to the account)
          if (isMonthly) {
            const isAnnual = amount === 294;
            const subType = isAnnual ? 'annual' : 'monthly';
            const userRef = db.collection("users").doc(email.toLowerCase().trim());
            
            transaction.update(userRef, {
              subscription_type: subType,
              monthly_allowance: creditsToGive,
              last_renewal_date: admin.firestore.FieldValue.serverTimestamp(),
              subscription_end_date: isAnnual ? admin.firestore.Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)) : null
            });
          }
        });

        console.log(`Successfully processed payment for ${email}. Generated code: ${newCode}`);
        
        // Send email to user
        await sendCodeEmail(email, newCode, creditsToGive);
      }

      // Always return 200 to Meshulam to acknowledge receipt
      res.status(200).send("OK");
    } catch (error) {
      console.error("Meshulam Webhook error:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  app.get("/api/user/codes", async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const normalizedEmail = email.toString().toLowerCase().trim();
      
      // Get codes used by this user
      const usedSnapshot = await db.collection("access_codes").where("usedBy", "==", normalizedEmail).get();
      const usedCodes = usedSnapshot.docs.map(doc => doc.data());
      
      // Get codes purchased by this user (EXAM- prefix)
      const purchasedSnapshot = await db.collection("access_codes").where("purchasedBy", "==", normalizedEmail).get();
      const purchasedCodes = purchasedSnapshot.docs.map(doc => doc.data());

      // Combine and unique
      const allCodes = [...usedCodes, ...purchasedCodes];
      const uniqueCodes = Array.from(new Map(allCodes.map(item => [item['code'], item])).values());
      
      res.json(uniqueCodes);
    } catch (error) {
      console.error("Error fetching user codes:", error);
      res.status(500).json({ error: "Failed to fetch codes" });
    }
  });

  app.post("/api/admin/simulate-purchase", async (req, res) => {
    try {
      const { email, amount, adminEmail } = req.body;
      if (adminEmail !== "shiraroth.z@gmail.com" && adminEmail !== "shira@lomdot.org") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      if (!email) return res.status(400).json({ error: "Email is required" });

      const purchaseAmount = parseFloat(amount || "50");
      let creditsToGive = 5;
      let isMonthly = false;
      
      if (purchaseAmount === 35) {
        creditsToGive = 50;
        isMonthly = true;
      } else if (purchaseAmount >= 50) {
        creditsToGive = 50;
      } else if (purchaseAmount >= 29) {
        creditsToGive = 20;
      }

      const newCode = `EXAM-${uuidv4().substring(0, 8).toUpperCase()}`;
      
      await db.runTransaction(async (transaction) => {
        const purchaseRef = db.collection("purchases").doc(uuidv4());
        transaction.set(purchaseRef, {
          email,
          amount: purchaseAmount,
          credits: creditsToGive,
          status: 'success',
          transaction_id: `MOCK-${uuidv4().substring(0, 8)}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const codeRef = db.collection("access_codes").doc(newCode);
        transaction.set(codeRef, {
          code: newCode,
          credits: creditsToGive,
          used: false,
          purchasedBy: email.toLowerCase().trim(),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        if (isMonthly) {
          const userRef = db.collection("users").doc(email.toLowerCase().trim());
          transaction.update(userRef, {
            subscription_type: 'monthly',
            monthly_allowance: creditsToGive,
            last_renewal_date: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      });

      await sendCodeEmail(email, newCode, creditsToGive);
      res.json({ success: true, code: newCode, credits: creditsToGive });
    } catch (error) {
      console.error("Simulation error:", error);
      res.status(500).json({ error: "Simulation failed" });
    }
  });

  app.get("/api/public/settings", async (req, res) => {
    try {
      const settings = {
        LOGO_URL: await getSetting("LOGO_URL") || "",
        GATE_LOGO_URL: await getSetting("GATE_LOGO_URL") || "",
        APP_NAME: await getSetting("APP_NAME") || "ExamAccess Pro",
        SUPPORT_EMAIL: await getSetting("SUPPORT_EMAIL") || "shira@lomdot.org",
        GEMINI_API_KEY: await getSetting("GEMINI_API_KEY") || ""
      };
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch public settings" });
    }
  });

  app.get("/api/admin/settings", async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: "Email is required" });
      
      const userDoc = await db.collection("users").doc(email as string).get();
      const isAdmin = email === "shiraroth.z@gmail.com" || 
                      email === "shira@lomdot.org" || 
                      userDoc.data()?.subscriptionType === "admin";

      if (!isAdmin) return res.status(403).json({ error: "Unauthorized" });

      const snapshot = await db.collection("settings").get();
      const settings = snapshot.docs.reduce((acc, doc) => ({ ...acc, [doc.id]: doc.data().value }), {});
      res.json(settings);
    } catch (error) {
      console.error("Error fetching admin settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/admin/settings", async (req, res) => {
    try {
      const { email, settings } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const userDoc = await db.collection("users").doc(email).get();
      const isAdmin = email === "shiraroth.z@gmail.com" || 
                      email === "shira@lomdot.org" || 
                      userDoc.data()?.subscriptionType === "admin";

      if (!isAdmin) return res.status(403).json({ error: "Unauthorized" });

      const batch = db.batch();
      for (const [key, value] of Object.entries(settings)) {
        const ref = db.collection("settings").doc(key);
        batch.set(ref, { value });
      }
      await batch.commit();
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.post("/api/school-interest", async (req, res) => {
    try {
      const { schoolName, contactName, role, email, phone, teacherCount, message } = req.body;
      if (!schoolName || !contactName || !email || !phone) {
        return res.status(400).json({ error: "שדות חובה חסרים" });
      }

      console.log(`School interest from ${schoolName}: ${contactName} (${email})`);

      const transporter = await createTransporter();
      if (transporter) {
        const adminEmail = process.env.SMTP_USER || await getSetting("SMTP_USER");
        await transporter.sendMail({
          from: `"ExamAccess School Interest" <${adminEmail}>`,
          to: "shira@lomdot.org",
          subject: `התעניינות מוסדית חדשה: ${schoolName}`,
          html: `
            <div dir="rtl" style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
              <h2 style="color: #0d9488;">בקשה להצעה מוסדית חדשה</h2>
              <p><strong>שם בית הספר:</strong> ${schoolName}</p>
              <p><strong>איש קשר:</strong> ${contactName}</p>
              <p><strong>תפקיד:</strong> ${role}</p>
              <p><strong>אימייל:</strong> ${email}</p>
              <p><strong>טלפון:</strong> ${phone}</p>
              <p><strong>מספר מורים משוער:</strong> ${teacherCount || 'לא צוין'}</p>
              <p><strong>הודעה/הערות:</strong></p>
              <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 10px 0; white-space: pre-wrap;">${message || 'אין הערות'}</div>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
              <p style="font-size: 12px; color: #64748b;">הודעה זו נשלחה אוטומטית ממערכת ExamAccess</p>
            </div>
          `,
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("School interest form error:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, message } = req.body;
      if (!name || !email || !message) {
        return res.status(400).json({ error: "כל השדות חובה" });
      }

      console.log(`Contact request from ${name} (${email}): ${message}`);

      const transporter = await createTransporter();
      if (transporter) {
        const adminEmail = process.env.SMTP_USER || await getSetting("SMTP_USER");
        await transporter.sendMail({
          from: `"ExamAccess Contact" <${adminEmail}>`,
          to: "shira@lomdot.org",
          subject: `פנייה חדשה מ-ExamAccess: ${name}`,
          html: `
            <div dir="rtl" style="font-family: sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
              <h2 style="color: #0d9488;">פנייה חדשה מהאתר</h2>
              <p><strong>שם:</strong> ${name}</p>
              <p><strong>אימייל:</strong> ${email}</p>
              <p><strong>הודעה:</strong></p>
              <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 10px 0; white-space: pre-wrap;">${message}</div>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
              <p style="font-size: 12px; color: #64748b;">הודעה זו נשלחה אוטומטית ממערכת ExamAccess</p>
            </div>
          `,
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Contact form error:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.post("/api/tests", async (req, res) => {
    try {
      let { data, email, code } = req.body;
      
      if (code && code.includes('@')) {
        email = code;
      }

      if (!email && !code) return res.status(401).json({ error: "User identification required" });

      const id = uuidv4();
      const ownerEmail = email ? email.toLowerCase().trim() : `user-${code}@temp.com`;
      
      await db.runTransaction(async (transaction) => {
        const userRef = db.collection("users").doc(ownerEmail);
        const userDoc = await transaction.get(userRef);
        
        if (!userDoc.exists || (userDoc.data()?.credits || 0) <= 0) {
          throw new Error("No credits remaining");
        }

        const testRef = db.collection("tests").doc(id);
        transaction.set(testRef, {
          id,
          data: JSON.stringify(data),
          ownerEmail,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        transaction.update(userRef, { 
          credits: (userDoc.data()?.credits || 0) - 1 
        });
      });
      
      res.json({ id });
    } catch (error: any) {
      console.error("Error saving test:", error);
      res.status(500).json({ error: error.message || "Failed to save test" });
    }
  });

  app.get("/api/user/tests", async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const snapshot = await db.collection("tests")
        .where("ownerEmail", "==", email.toString().toLowerCase().trim())
        .orderBy("createdAt", "desc")
        .get();
      
      const tests = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: data.id,
          title: JSON.parse(data.data).title || "מבחן ללא כותרת",
          created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
        };
      });

      res.json(tests);
    } catch (error) {
      console.error("Error fetching user tests:", error);
      res.status(500).json({ error: "Failed to fetch tests" });
    }
  });

  app.get("/api/tests/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const doc = await db.collection("tests").doc(id).get();
      
      if (doc.exists) {
        res.json(JSON.parse(doc.data()?.data));
      } else {
        res.status(404).json({ error: "Test not found" });
      }
    } catch (error) {
      console.error("Error loading test:", error);
      res.status(500).json({ error: "Failed to load test" });
    }
  });

  app.get("/api/config", async (req, res) => {
    try {
      const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_API_KEY;
      const dbKey = await getSetting("GEMINI_API_KEY");
      const key = dbKey || envKey;
      
      const isAvailable = !!key && key !== "MY_GEMINI_API_KEY" && key.length > 10;
      res.json({ 
        systemKeyAvailable: isAvailable,
        apiKey: isAvailable ? key : null,
        appUrl: process.env.APP_URL || ""
      });
    } catch (error) {
      console.error("Error fetching config:", error);
      res.status(500).json({ error: "Failed to fetch config" });
    }
  });

  // Vite middleware for development or if production build is missing
  const isProduction = process.env.NODE_ENV === "production";
  const distPath = path.join(__dirname, "dist");
  const hasDist = fs.existsSync(distPath);

  if (!isProduction || !hasDist) {
    if (isProduction && !hasDist) {
      console.warn("Production mode detected but 'dist' folder is missing. Falling back to Vite middleware...");
    } else {
      console.log("Starting server in development mode with Vite middleware...");
    }
    
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // Add catch-all for SPA in dev mode
    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    console.log("Starting server in production mode...");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
