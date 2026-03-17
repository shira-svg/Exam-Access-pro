import Database from "better-sqlite3";
try {
  const db = new Database("tests.db");
  console.log("Database opened successfully");
  const row = db.prepare("SELECT 1").get();
  console.log("Query result:", row);
} catch (e) {
  console.error("Database error:", e);
  process.exit(1);
}
