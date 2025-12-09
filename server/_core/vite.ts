import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";

function logDirectoryStructure(dir: string, prefix = "", maxDepth = 3, currentDepth = 0): void {
  if (currentDepth >= maxDepth) return;
  
  try {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      const isDir = stat.isDirectory();
      
      console.log(`${prefix}${isDir ? "📁" : "📄"} ${file}`);
      
      if (isDir && !file.startsWith(".")) {
        logDirectoryStructure(filePath, prefix + "  ", maxDepth, currentDepth + 1);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
}

function checkBuildFiles(): void {
  console.log("\n=== BUILD FILES DIAGNOSTIC ===\n");
  
  const distPath = path.resolve(import.meta.dirname, "..", "public");
  const indexPath = path.resolve(distPath, "index.html");
  
  console.log(`Checking: ${distPath}`);
  console.log(`Index exists: ${fs.existsSync(indexPath)}`);
  
  if (fs.existsSync(distPath)) {
    console.log("\nDirectory structure:");
    logDirectoryStructure(distPath);
  } else {
    console.log("Directory does not exist!");
    
    // Check parent directories
    const parentPath = path.resolve(import.meta.dirname, "..");
    console.log(`\nChecking parent: ${parentPath}`);
    if (fs.existsSync(parentPath)) {
      console.log("Parent directory contents:");
      logDirectoryStructure(parentPath, "", 2);
    }
  }
  
  console.log("\n=== END DIAGNOSTIC ===\n");
}

export async function setupVite(app: Express, server: Server) {
  // Importação dinâmica de vite (apenas em desenvolvimento)
  const { createServer: createViteServer } = await import("vite");

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  // Criar configuração mínima sem importar vite.config
  const viteConfig = {
    root: path.resolve(import.meta.dirname, "../..", "client"),
    publicDir: path.resolve(import.meta.dirname, "../..", "client", "public"),
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "../..", "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "../..", "shared"),
        "@assets": path.resolve(import.meta.dirname, "../..", "attached_assets"),
      },
    },
    envDir: path.resolve(import.meta.dirname, "../.."),
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  checkBuildFiles();
  
  const distPath = path.resolve(import.meta.dirname, "..", "public");
  const indexPath = path.resolve(distPath, "index.html");
  
  console.log(`[serveStatic] Serving static files from: ${distPath}`);
  console.log(`[serveStatic] Index file exists: ${fs.existsSync(indexPath)}`);
  
  if (!fs.existsSync(distPath)) {
    console.error(
      `[ERROR] Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // Servir arquivos estáticos
  app.use(express.static(distPath, { 
    maxAge: "1d",
    etag: false 
  }));

  // Fallback para index.html (SPA)
  app.use("*", (_req, res) => {
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Not Found - index.html not found");
    }
  });
}
