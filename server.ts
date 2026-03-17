import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("tests.db");

// Email Transporter Setup
const getSetting = (key: string) => {
  const stmt = db.prepare("SELECT value FROM settings WHERE key = ?");
  const row = stmt.get(key) as { value: string } | undefined;
  return row?.value;
};

const createTransporter = () => {
  let host = process.env.SMTP_HOST || getSetting("SMTP_HOST");
  let portStr = process.env.SMTP_PORT || getSetting("SMTP_PORT") || "587";
  let user = process.env.SMTP_USER || getSetting("SMTP_USER");
  let pass = process.env.SMTP_PASS || getSetting("SMTP_PASS");

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
  const transporter = createTransporter();
  const user = process.env.SMTP_USER || getSetting("SMTP_USER");
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

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS tests (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    owner_email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    name TEXT,
    password_hash TEXT,
    credits INTEGER NOT NULL DEFAULT 5,
    subscription_type TEXT DEFAULT 'free',
    last_renewal_date DATETIME,
    monthly_allowance INTEGER DEFAULT 0,
    subscription_end_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS access_codes (
    code TEXT PRIMARY KEY,
    credits INTEGER NOT NULL,
    used INTEGER DEFAULT 0,
    used_by TEXT,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    amount REAL,
    credits INTEGER,
    status TEXT,
    transaction_id TEXT,
    raw_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Migration: Ensure owner_email column exists in tests table
try {
  db.prepare("ALTER TABLE tests ADD COLUMN owner_email TEXT").run();
} catch (e) {
  // Column probably already exists
}

// Migration: Add subscription columns to users if they don't exist
try {
  db.exec("ALTER TABLE users ADD COLUMN name TEXT");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN subscription_type TEXT DEFAULT 'free'");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN last_renewal_date DATETIME");
} catch (e) {}
try {
  db.exec("ALTER TABLE users ADD COLUMN monthly_allowance INTEGER DEFAULT 0");
} catch (e) {}

try {
  db.exec("ALTER TABLE users ADD COLUMN subscription_end_date DATETIME");
} catch (e) {}

// Credit Renewal Logic
const checkAndRenewCredits = (email: string) => {
  const user = db.prepare("SELECT credits, subscription_type, last_renewal_date, monthly_allowance, subscription_end_date FROM users WHERE LOWER(email) = ?").get(email.toLowerCase()) as any;
  
  if (!user || (user.subscription_type !== 'monthly' && user.subscription_type !== 'annual') || !user.monthly_allowance) return user?.credits;

  const now = new Date();
  
  // Check if subscription has ended
  if (user.subscription_end_date) {
    const endDate = new Date(user.subscription_end_date);
    if (now > endDate) {
      db.prepare("UPDATE users SET subscription_type = 'free', monthly_allowance = 0 WHERE LOWER(email) = ?").run(email.toLowerCase());
      return user.credits;
    }
  }

  const lastRenewal = user.last_renewal_date ? new Date(user.last_renewal_date) : new Date(0);
  
  // Calculate months passed since last renewal
  const diffTime = Math.abs(now.getTime() - lastRenewal.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const monthsToRenew = Math.floor(diffDays / 30);

  if (monthsToRenew > 0) {
    const newCredits = user.credits + (user.monthly_allowance * monthsToRenew);
    db.prepare("UPDATE users SET credits = ?, last_renewal_date = CURRENT_TIMESTAMP WHERE LOWER(email) = ?").run(newCredits, email.toLowerCase());
    console.log(`Renewed ${user.monthly_allowance * monthsToRenew} credits for ${email}. New balance: ${newCredits}`);
    return newCredits;
  }

  return user.credits;
};

// Create fictitious user and code for testing
  try {
    const testEmail = "shira@lomdot.org";
    const testEmail2 = "shiraroth.z@gmail.com";
    const testCode = "PRO-TEST-2026";
    
    const userStmt = db.prepare("INSERT INTO users (email, name, credits) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name");
    userStmt.run(testEmail, "שירה", 5);
    userStmt.run(testEmail2, "שירה", 5);
    
    const codeStmt = db.prepare("INSERT OR IGNORE INTO access_codes (code, credits) VALUES (?, ?)");
  codeStmt.run(testCode, 5); // A code that gives 5 credits

  // Add the specific test code requested by the user
  codeStmt.run("TEST123", 5);
  userStmt.run("test@shira.com", "משתמש בדיקה", 5);
  
  console.log("Fictitious test data initialized.");
} catch (e) {
  console.error("Error initializing test data:", e);
}

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
  app.post("/api/auth/guest-login", (req, res) => {
    try {
      const guestEmail = "guest@examaccess.pro";
      const guestName = "אורח במערכת";
      
      const checkStmt = db.prepare("SELECT email, name, credits FROM users WHERE email = ?");
      let user = checkStmt.get(guestEmail) as { email: string; name: string; credits: number } | undefined;
      
      if (!user) {
        const insertStmt = db.prepare("INSERT INTO users (email, name, credits) VALUES (?, ?, ?)");
        insertStmt.run(guestEmail, guestName, 10);
        user = { email: guestEmail, name: guestName, credits: 10 };
      }
      
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Guest login failed" });
    }
  });

  app.post("/api/auth/verify", (req, res) => {
    try {
      const { code } = req.body;
      console.log("Verifying code/email:", code);
      if (!code || typeof code !== 'string') return res.status(400).json({ error: "Valid code is required" });

      // Check if it's an email (Google Login)
      if (code.includes('@')) {
        const email = code.trim().toLowerCase();
        const currentCredits = checkAndRenewCredits(email);
        const stmt = db.prepare("SELECT email, name, credits, subscription_type FROM users WHERE LOWER(email) = ?");
        const user = stmt.get(email) as { email: string; name: string | null; credits: number; subscription_type: string } | undefined;
        if (user) {
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
        const stmt = db.prepare("SELECT email, credits FROM users WHERE email = 'test@shira.com'");
        const user = stmt.get() as { email: string; credits: number };
        return res.json({ email: user.email, credits: user.credits, code: "TEST123" });
      }

      // General check in access_codes
      const stmt = db.prepare("SELECT code, credits FROM access_codes WHERE code = ? AND used = 0");
      const row = stmt.get(code) as { code: string; credits: number } | undefined;

      if (row) {
        // Ensure user exists for this code
        const email = `user-${code}@temp.com`;
        db.prepare("INSERT OR IGNORE INTO users (email, credits) VALUES (?, ?)").run(email, row.credits);
        res.json({ email, credits: row.credits, code: row.code });
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
      const existingUser = db.prepare("SELECT email FROM users WHERE LOWER(email) = ?").get(normalizedEmail);
      if (existingUser) return res.status(400).json({ error: "משתמש עם אימייל זה כבר קיים במערכת" });

      const hashedPassword = await bcrypt.hash(password, 10);
      
      db.prepare("INSERT INTO users (email, name, password_hash, credits) VALUES (?, ?, ?, ?)").run(normalizedEmail, name || '', hashedPassword, 5);
      
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
      checkAndRenewCredits(normalizedEmail);
      const user = db.prepare("SELECT email, name, password_hash, credits, subscription_type FROM users WHERE LOWER(email) = ?").get(normalizedEmail) as any;

      if (!user || !user.password_hash) {
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
      const stmt = db.prepare("INSERT INTO users (email, name, credits, last_renewal_date) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(email) DO UPDATE SET name = excluded.name");
      stmt.run(email, name, 5); // Default 5 credits for new users
      
      checkAndRenewCredits(email);
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

  app.post("/api/auth/user-info", (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const currentCredits = checkAndRenewCredits(email);
      const stmt = db.prepare("SELECT email, credits FROM users WHERE email = ?");
      const user = stmt.get(email) as { email: string; credits: number } | undefined;

      if (user) {
        res.json(user);
      } else {
        res.status(404).json({ error: "User not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user info" });
    }
  });

  app.post("/api/auth/redeem", (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) return res.status(400).json({ error: "Email and code are required" });

      const codeStmt = db.prepare("SELECT credits, used FROM access_codes WHERE code = ?");
      const accessCode = codeStmt.get(code) as { credits: number; used: number } | undefined;

      if (!accessCode) return res.status(404).json({ error: "קוד לא תקין" });
      if (accessCode.used) return res.status(400).json({ error: "הקוד כבר נוצל" });

      const transaction = db.transaction(() => {
        // Ensure user exists
        db.prepare("INSERT OR IGNORE INTO users (email, credits) VALUES (?, 0)").run(email);

        // Update user credits
        const userStmt = db.prepare("UPDATE users SET credits = credits + ? WHERE email = ?");
        userStmt.run(accessCode.credits, email);

        // Mark code as used
        const updateCodeStmt = db.prepare("UPDATE access_codes SET used = 1, used_by = ?, used_at = CURRENT_TIMESTAMP WHERE code = ?");
        updateCodeStmt.run(email, code);
      });

      transaction();
      
      const userStmt = db.prepare("SELECT credits FROM users WHERE email = ?");
      const user = userStmt.get(email) as { credits: number } | undefined;
      
      if (!user) {
        throw new Error("Failed to find user after update");
      }
      
      res.json({ success: true, credits: user.credits });
    } catch (error) {
      console.error("Redeem error:", error);
      res.status(500).json({ error: "Failed to redeem code" });
    }
  });

  app.post("/api/admin/update-credits", (req, res) => {
    try {
      const { adminEmail, targetEmail, credits } = req.body;
      if (adminEmail !== "shiraroth.z@gmail.com" && adminEmail !== "shira@lomdot.org") {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const stmt = db.prepare("UPDATE users SET credits = ? WHERE email = ?");
      stmt.run(credits, targetEmail);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating credits:", error);
      res.status(500).json({ error: "Failed to update credits" });
    }
  });

  app.get("/api/admin/users", (req, res) => {
    try {
      const { email } = req.query;
      // Simple check: only shiraroth.z@gmail.com or shira@lomdot.org can see this
      if (email !== "shiraroth.z@gmail.com" && email !== "shira@lomdot.org") {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const stmt = db.prepare("SELECT email, name, credits, created_at FROM users ORDER BY created_at DESC");
      const users = stmt.all();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/add-credits", (req, res) => {
    try {
      const { code, credits, secret } = req.body;
      const adminSecret = process.env.ADMIN_SECRET;

      if (!adminSecret || secret !== adminSecret) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const stmt = db.prepare("INSERT INTO access_codes (code, credits) VALUES (?, ?)");
      stmt.run(code, credits);

      res.json({ success: true, message: `Code ${code} created with ${credits} credits` });
    } catch (error) {
      console.error("Error adding credits:", error);
      res.status(500).json({ error: "Failed to add credits" });
    }
  });

  // Meshulam Webhook
  app.post("/api/webhooks/meshulam", (req, res) => {
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
        
        const transaction = db.transaction(() => {
          // Save purchase
          db.prepare(`
            INSERT INTO purchases (id, email, amount, credits, status, transaction_id, raw_data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(uuidv4(), email, amount, creditsToGive, 'success', transaction_id, JSON.stringify(req.body));

          // Create access code (NOT auto-redeemed, user must enter it manually)
          db.prepare("INSERT INTO access_codes (code, credits) VALUES (?, ?)").run(newCode, creditsToGive);
          
          // If monthly, update user directly as well (Monthly is a subscription, usually tied to the account)
          if (isMonthly) {
            const isAnnual = amount === 294;
            const subType = isAnnual ? 'annual' : 'monthly';
            const endDate = isAnnual ? "datetime('now', '+1 year')" : "NULL";
            
            db.prepare(`
              UPDATE users 
              SET subscription_type = ?, 
                  monthly_allowance = ?, 
                  last_renewal_date = CURRENT_TIMESTAMP,
                  subscription_end_date = ${endDate}
              WHERE LOWER(email) = ?
            `).run(subType, creditsToGive, email.toLowerCase());
          }
        });

        transaction();
        
        console.log(`Successfully processed payment for ${email}. Generated code: ${newCode}`);
        
        // Send email to user
        sendCodeEmail(email, newCode, creditsToGive);
      }

      // Always return 200 to Meshulam to acknowledge receipt
      res.status(200).send("OK");
    } catch (error) {
      console.error("Meshulam Webhook error:", error);
      res.status(500).send("Internal Server Error");
    }
  });

  app.get("/api/user/codes", (req, res) => {
    try {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: "Email is required" });

      // Find codes generated for this email via purchases
      // Or codes used by this email
      const codes = db.prepare(`
        SELECT c.code, c.credits, c.used, c.used_at, c.created_at
        FROM access_codes c
        LEFT JOIN purchases p ON p.email = ?
        WHERE c.used_by = ? OR (p.email = ? AND c.code LIKE 'EXAM-%' AND c.created_at >= p.created_at)
        GROUP BY c.code
        ORDER BY c.created_at DESC
      `).all(email, email, email);

      res.json(codes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch codes" });
    }
  });

  app.post("/api/admin/simulate-purchase", (req, res) => {
    try {
      const { email, amount, adminEmail } = req.body;
      if (adminEmail !== "shiraroth.z@gmail.com" && adminEmail !== "shira@lomdot.org") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      if (!email) return res.status(400).json({ error: "Email is required" });

      // Simulate Meshulam Webhook payload
      const mockPayload = {
        status: "1",
        sum: amount || "50",
        transaction_id: `MOCK-${uuidv4().substring(0, 8)}`,
        custom_fields: JSON.stringify({ email })
      };

      // Call the webhook logic internally or just trigger it via fetch
      // For simplicity, we'll just trigger the same logic here
      let creditsToGive = 5;
      let isMonthly = false;
      const purchaseAmount = parseFloat(mockPayload.sum);
      
      if (purchaseAmount === 35) {
        creditsToGive = 50;
        isMonthly = true;
      } else if (purchaseAmount >= 50) {
        creditsToGive = 50;
      } else if (purchaseAmount >= 29) {
        creditsToGive = 20;
      }

      const newCode = `EXAM-${uuidv4().substring(0, 8).toUpperCase()}`;
      
      const transaction = db.transaction(() => {
        db.prepare(`
          INSERT INTO purchases (id, email, amount, credits, status, transaction_id, raw_data)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), email, purchaseAmount, creditsToGive, 'success', mockPayload.transaction_id, JSON.stringify(mockPayload));

        db.prepare("INSERT INTO access_codes (code, credits) VALUES (?, ?)").run(newCode, creditsToGive);

        if (isMonthly) {
          db.prepare(`
            UPDATE users 
            SET subscription_type = 'monthly', 
                monthly_allowance = ?, 
                last_renewal_date = CURRENT_TIMESTAMP 
            WHERE LOWER(email) = ?
          `).run(creditsToGive, email.toLowerCase());
        }
      });

      transaction();

      // Send email to user
      sendCodeEmail(email, newCode, creditsToGive);

      res.json({ success: true, code: newCode, credits: creditsToGive });
    } catch (error) {
      console.error("Simulation error:", error);
      res.status(500).json({ error: "Simulation failed" });
    }
  });

  app.get("/api/public/settings", (req, res) => {
    try {
      const logoRow = db.prepare("SELECT value FROM settings WHERE key = 'LOGO_URL'").get() as { value: string } | undefined;
      const gateLogoRow = db.prepare("SELECT value FROM settings WHERE key = 'GATE_LOGO_URL'").get() as { value: string } | undefined;
      const appNameRow = db.prepare("SELECT value FROM settings WHERE key = 'APP_NAME'").get() as { value: string } | undefined;
      const supportEmailRow = db.prepare("SELECT value FROM settings WHERE key = 'SUPPORT_EMAIL'").get() as { value: string } | undefined;
      const geminiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'GEMINI_API_KEY'").get() as { value: string } | undefined;
      
      res.json({ 
        LOGO_URL: logoRow?.value || "",
        GATE_LOGO_URL: gateLogoRow?.value || "",
        APP_NAME: appNameRow?.value || "ExamAccess Pro",
        SUPPORT_EMAIL: supportEmailRow?.value || "shira@lomdot.org",
        GEMINI_API_KEY: geminiKeyRow?.value || ""
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch public settings" });
    }
  });

  app.get("/api/admin/settings", (req, res) => {
    try {
      const { email } = req.query;
      if (email !== "shiraroth.z@gmail.com" && email !== "shira@lomdot.org") return res.status(403).json({ error: "Unauthorized" });

      const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string, value: string }[];
      const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/admin/settings", (req, res) => {
    try {
      const { email, settings } = req.body;
      if (email !== "shiraroth.z@gmail.com" && email !== "shira@lomdot.org") return res.status(403).json({ error: "Unauthorized" });

      const transaction = db.transaction(() => {
        for (const [key, value] of Object.entries(settings)) {
          db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
        }
      });
      transaction();
      res.json({ success: true });
    } catch (error) {
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

      const transporter = createTransporter();
      if (transporter) {
        const adminEmail = process.env.SMTP_USER || getSetting("SMTP_USER");
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

      const transporter = createTransporter();
      if (transporter) {
        const adminEmail = process.env.SMTP_USER || getSetting("SMTP_USER");
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

  app.post("/api/tests", (req, res) => {
    try {
      let { data, email, code } = req.body;
      
      // If code is an email, treat it as email
      if (code && code.includes('@')) {
        email = code;
      }

      if (!email && !code) return res.status(401).json({ error: "User identification required" });

      const id = uuidv4();
      const ownerEmail = email ? email.toLowerCase().trim() : null;
      
      const transaction = db.transaction(() => {
        if (code === "TEST123" || email === "test@shira.com") {
          const checkStmt = db.prepare("SELECT credits FROM users WHERE email = 'test@shira.com'");
          const user = checkStmt.get() as { credits: number };
          if (user.credits <= 0) throw new Error("No credits remaining");

          const insertStmt = db.prepare("INSERT INTO tests (id, data, owner_email) VALUES (?, ?, ?)");
          insertStmt.run(id, JSON.stringify(data), 'test@shira.com');

          const deductStmt = db.prepare("UPDATE users SET credits = credits - 1 WHERE email = 'test@shira.com'");
          deductStmt.run();
        } else if (email) {
          const checkStmt = db.prepare("SELECT credits FROM users WHERE email = ?");
          const user = checkStmt.get(email.toLowerCase().trim()) as { credits: number } | undefined;
          if (!user || user.credits <= 0) throw new Error("No credits remaining");

          const insertStmt = db.prepare("INSERT INTO tests (id, data, owner_email) VALUES (?, ?, ?)");
          insertStmt.run(id, JSON.stringify(data), email.toLowerCase().trim());

          const deductStmt = db.prepare("UPDATE users SET credits = credits - 1 WHERE email = ?");
          deductStmt.run(email.toLowerCase().trim());
        } else if (code) {
          // This part is for temporary users created via access code redemption
          // But usually they get an email like user-code@temp.com
          const tempEmail = `user-${code}@temp.com`;
          const checkStmt = db.prepare("SELECT credits FROM users WHERE email = ?");
          const user = checkStmt.get(tempEmail) as { credits: number } | undefined;
          if (!user || user.credits <= 0) throw new Error("No credits remaining");

          const insertStmt = db.prepare("INSERT INTO tests (id, data, owner_email) VALUES (?, ?, ?)");
          insertStmt.run(id, JSON.stringify(data), tempEmail);

          const deductStmt = db.prepare("UPDATE users SET credits = credits - 1 WHERE email = ?");
          deductStmt.run(tempEmail);
        }
      });

      transaction();
      
      res.json({ id });
    } catch (error: any) {
      console.error("Error saving test:", error);
      res.status(500).json({ error: error.message || "Failed to save test" });
    }
  });

  app.get("/api/user/tests", (req, res) => {
    try {
      const { email } = req.query;
      if (!email) return res.status(400).json({ error: "Email is required" });

      const stmt = db.prepare("SELECT id, data, created_at FROM tests WHERE owner_email = ? ORDER BY created_at DESC");
      const rows = stmt.all(email.toString().toLowerCase().trim()) as { id: string, data: string, created_at: string }[];
      
      const tests = rows.map(row => ({
        id: row.id,
        title: JSON.parse(row.data).title || "מבחן ללא כותרת",
        created_at: row.created_at
      }));

      res.json(tests);
    } catch (error) {
      console.error("Error fetching user tests:", error);
      res.status(500).json({ error: "Failed to fetch tests" });
    }
  });

  app.get("/api/tests/:id", (req, res) => {
    try {
      const { id } = req.params;
      const stmt = db.prepare("SELECT data FROM tests WHERE id = ?");
      const row = stmt.get(id) as { data: string } | undefined;
      
      if (row) {
        res.json(JSON.parse(row.data));
      } else {
        res.status(404).json({ error: "Test not found" });
      }
    } catch (error) {
      console.error("Error loading test:", error);
      res.status(500).json({ error: "Failed to load test" });
    }
  });

  app.get("/api/config", (req, res) => {
    const key = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_API_KEY;
    const isAvailable = !!key && key !== "MY_GEMINI_API_KEY" && key.length > 10;
    res.json({ 
      systemKeyAvailable: isAvailable,
      apiKey: isAvailable ? key : null,
      appUrl: process.env.APP_URL || ""
    });
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
