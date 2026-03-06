import { Router } from "express";
import { queries } from "../services/db";
import { validateParamId, validateUUID, MAX_TITLE_LENGTH } from "../middleware/validation";

const router = Router();

router.get("/", (_req, res) => {
  res.json(queries.listConversations.all());
});

router.post("/", (req, res) => {
  const { id, title } = req.body;
  if (!validateUUID(id)) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'id must be a valid UUID' });
  }
  if (typeof title !== 'string' || title.length > MAX_TITLE_LENGTH) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: `title must be a string under ${MAX_TITLE_LENGTH} chars` });
  }
  queries.insertConversation.run(id, title);
  res.json({ success: true });
});

router.patch("/:id", validateParamId, (req, res) => {
  const { title } = req.body;
  if (typeof title !== 'string' || title.length > MAX_TITLE_LENGTH) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: `title must be a string under ${MAX_TITLE_LENGTH} chars` });
  }
  queries.updateConversation.run(title, req.params.id);
  res.json({ success: true });
});

router.delete("/:id", validateParamId, (req, res) => {
  queries.deleteConversation.run(req.params.id);
  res.json({ success: true });
});

router.delete("/:id/clear", validateParamId, (req, res) => {
  queries.clearMessages.run(req.params.id);
  res.json({ success: true });
});

router.get("/:id/messages", validateParamId, (req, res) => {
  res.json(queries.getMessages.all(req.params.id));
});

export default router;
