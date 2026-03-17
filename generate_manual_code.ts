import Database from "better-sqlite3";
import { v4 as uuidv4 } from 'uuid';

const db = new Database("tests.db");
const code = `EXAM-${uuidv4().split('-')[0].toUpperCase()}`;
const credits = 5;

db.prepare("INSERT INTO access_codes (code, credits, used) VALUES (?, ?, ?)").run(code, credits, 0);

console.log("MANUAL_CODE_GENERATED:" + code);
