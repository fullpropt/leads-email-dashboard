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
import { handleMailgunIncomingWebhook } from "../webhooks-support";
import { handleStripeWebhook } from "../webhooks-stripe";

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

  // ===== WEBHOOK STRIPE =====
  // IMPORTANTE: Stripe precisa do body RAW para validar assinatura.
  // Por isso este endpoint é registrado ANTES do express.json().
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    handleStripeWebhook
  );
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // GitHub OAuth routes (removed Manus OAuth)
  registerGitHubOAuthRoutes(app);
  
  // Webhook para PerfectPay (legado)
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

  // Health check para o webhook legado
  app.get("/api/webhooks/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      message: "Webhook endpoint está funcionando",
    });
  });

  // Health check para webhook do Stripe
  app.get("/api/webhooks/stripe/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      message: "Stripe webhook endpoint está funcionando",
    });
  });

  // ===== WEBHOOK MAILGUN - EMAILS DE SUPORTE =====
  // Recebe emails de suporte via Mailgun Routes
  app.post("/api/webhooks/mailgun/incoming", handleMailgunIncomingWebhook);
  
  // Health check para webhook do Mailgun
  app.get("/api/webhooks/mailgun/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      message: "Mailgun webhook endpoint está funcionando",
    });
  });

  // ===== UNSUBSCRIBE ENDPOINT =====
  // Página de unsubscribe (GET - mostra confirmação)
  app.get("/unsubscribe/:token", async (req, res) => {
    const { token } = req.params;
    const { processUnsubscribe, getDb } = await import("../db");
    // Inicializa a conexão com o banco de dados antes de usá-la.
    await getDb();
    
    // Garantir que a conexão com o banco de dados esteja ativa
    const db = await getDb();
    if (!db) {
      console.error("[Unsubscribe] Database connection failed");
      return res.status(500).send("Database connection failed.");
    }
    
    try {
      const result = await processUnsubscribe(token);
      
      // Retornar página HTML de confirmação
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe - TubeTools</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      background-color: #f9f9f9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      padding: 40px;
      max-width: 500px;
      text-align: center;
    }
    .logo {
      max-width: 200px;
      margin-bottom: 30px;
    }
    .icon {
      font-size: 60px;
      margin-bottom: 20px;
    }
    .success { color: #22c55e; }
    .error { color: #ef4444; }
    h1 {
      color: #333;
      margin-bottom: 15px;
      font-size: 24px;
    }
    p {
      color: #666;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .email {
      background: #f5f5f5;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: bold;
      color: #333;
      display: inline-block;
      margin-bottom: 20px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      color: #999;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663266054093/HaAhrQWlddPFPJjs.png" alt="TubeTools" class="logo">
    
    ${result.success ? `
      <div class="icon success">✓</div>
      <h1>Successfully Unsubscribed</h1>
      ${result.email ? `<div class="email">${result.email}</div>` : ''}
      <p>${result.message === 'You have already unsubscribed' 
        ? 'You have already unsubscribed from our mailing list.' 
        : 'You have been removed from our mailing list and will no longer receive promotional emails from TubeTools.'}</p>
    ` : `
      <div class="icon error">✗</div>
      <h1>Unsubscribe Failed</h1>
      <p>We couldn't process your unsubscribe request. The link may be invalid or expired.</p>
      <p>If you continue to receive emails, please contact our support team.</p>
    `}
    
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} TubeTools. All rights reserved.</p>
      <p>Support: <a href="mailto:supfullpropt@gmail.com" style="color: #FF0000;">supfullpropt@gmail.com</a></p>
    </div>
  </div>
</body>
</html>
      `;
      
      res.status(200).send(html);
    } catch (error) {
      console.error("[Unsubscribe] Error:", error);
      res.status(500).send("An error occurred while processing your request.");
    }
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
    console.log(`Webhook endpoint (PerfectPay legado): http://localhost:${port}/api/webhooks/perfectpay`);
    console.log(`Webhook endpoint (Stripe): http://localhost:${port}/api/webhooks/stripe`);
    
    // Inicializar schedulers
    startScheduler();
    startFunnelScheduler();
    startSyncScheduler();
  });
}

startServer().catch(console.error);