import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerGitHubOAuthRoutes } from "./github-oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { processWebhook } from "../webhooks";
import { startScheduler } from "../scheduler";
import { startFunnelScheduler } from "../scheduler-funnel";
import { startSyncScheduler } from "../scheduler-sync-tubetools";

function isPortAvailable(port: number ): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // GitHub OAuth routes (removed Manus OAuth)
  registerGitHubOAuthRoutes(app);
  
  // Webhook para PerfectPay
  app.post("/api/webhooks/perfectpay", async (req, res) => {
    try {
      console.log("[Server] Webhook recebido em /api/webhooks/perfectpay");
      console.log("[Server] Headers:", req.headers);
      console.log("[Server] Body:", req.body);

      const result = await processWebhook(req.body);
      
      // Retornar 200 OK mesmo que haja erro (PerfectPay pode retentar)
      res.status(200).json(result);
    } catch (error) {
      console.error("[Server] Erro ao processar webhook:", error);
      res.status(200).json({
        success: false,
        message: "Erro ao processar webhook",
      });
    }
  });

  // Health check para o webhook
  app.get("/api/webhooks/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      message: "Webhook endpoint está funcionando",
    });
  });
  
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/` );
    console.log(`Webhook endpoint: http://localhost:${port}/api/webhooks/perfectpay`);
    
    // Inicializar schedulers
    startScheduler();
    startFunnelScheduler();
    startSyncScheduler();
  });
}

startServer().catch(console.error);
