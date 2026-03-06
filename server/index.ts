import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables BEFORE importing modules that read process.env at top level
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

async function startServer() {
  const [
    { default: express },
    { createServer: createViteServer },
    { default: helmet },
    { generalLimiter },
    { requireAuth },
    { default: aiRoutes },
    { default: conversationRoutes },
    { default: messageRoutes },
  ] = await Promise.all([
    import("express"),
    import("vite"),
    import("helmet"),
    import("./middleware/rateLimiter"),
    import("./middleware/auth"),
    import("./routes/ai"),
    import("./routes/conversations"),
    import("./routes/messages"),
  ]);

  const app = express();
  const PORT = parseInt(process.env.PORT || '5173', 10);

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", "https://generativelanguage.googleapis.com"],
        mediaSrc: ["'self'", "blob:", "data:"],
        workerSrc: ["'self'", "blob:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use('/api/', generalLimiter);

  // Mount route modules
  app.use('/api/ai', aiRoutes);
  app.use('/api/conversations', requireAuth, conversationRoutes);
  app.use('/api/messages', requireAuth, messageRoutes);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "..", "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
