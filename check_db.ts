import Database from "better-sqlite3";
const db = new Database("tests.db");
console.log("--- PURCHASES WITH AMOUNT 1 ---");
const purchases = db.prepare("SELECT email, amount, status, created_at FROM purchases WHERE amount = 1").all();
console.log(JSON.stringify(purchases, null, 2));

console.log("\n--- ALL RECENT PURCHASES ---");
const allPurchases = db.prepare("SELECT email, amount, status, created_at FROM purchases ORDER BY created_at DESC LIMIT 10").all();
console.log(JSON.stringify(allPurchases, null, 2));
