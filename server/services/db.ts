import Database from "better-sqlite3";

const db = new Database("conversations.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    role TEXT,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
`);

export const queries = {
  listConversations: db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC"),
  getMessages: db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"),
  insertConversation: db.prepare("INSERT INTO conversations (id, title) VALUES (?, ?)"),
  updateConversation: db.prepare("UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"),
  deleteConversation: db.prepare("DELETE FROM conversations WHERE id = ?"),
  insertMessage: db.prepare("INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)"),
  touchConversation: db.prepare("UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"),
  updateMessage: db.prepare("UPDATE messages SET content = ? WHERE id = ?"),
  deleteMessage: db.prepare("DELETE FROM messages WHERE id = ?"),
  clearMessages: db.prepare("DELETE FROM messages WHERE conversation_id = ?"),
} as const;

export default db;
