import { Router } from "express";
import { queries } from "../services/db";
import { validateParamId, validateUUID, MAX_CONTENT_LENGTH, VALID_ROLES } from "../middleware/validation";

const router = Router();

router.post("/", (req, res) => {
  const { id, conversation_id, role, content } = req.body;
  if (!validateUUID(id)) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'id must be a valid UUID' });
  }
  if (!validateUUID(conversation_id)) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'conversation_id must be a valid UUID' });
  }
  if (typeof role !== 'string' || !(VALID_ROLES as readonly string[]).includes(role)) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }
  if (typeof content !== 'string' || content.length > MAX_CONTENT_LENGTH) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: `content must be a string under ${MAX_CONTENT_LENGTH} chars` });
  }
  queries.insertMessage.run(id, conversation_id, role, content);
  queries.touchConversation.run(conversation_id);
  res.json({ success: true });
});

router.patch("/:id", validateParamId, (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string' || content.length > MAX_CONTENT_LENGTH) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: `content must be a string under ${MAX_CONTENT_LENGTH} chars` });
  }
  queries.updateMessage.run(content, req.params.id);
  res.json({ success: true });
});

router.delete("/:id", validateParamId, (req, res) => {
  queries.deleteMessage.run(req.params.id);
  res.json({ success: true });
});

export default router;
