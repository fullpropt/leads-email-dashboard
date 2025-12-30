/**
 * Conexão com o banco de dados do TubeTools
 * Permite verificar se um lead (por email) se cadastrou/acessou a plataforma
 */

import postgres from "postgres";

let tubetoolsSql: ReturnType<typeof postgres> | null = null;

/**
 * Obter conexão com o banco TubeTools
 */
export function getTubetoolsDb() {
  if (!tubetoolsSql) {
    const connectionString = process.env.TUBETOOLS_DATABASE_URL;
    
    if (!connectionString) {
      console.warn("[TubeTools DB] TUBETOOLS_DATABASE_URL não está configurada");
      return null;
    }

    console.log("[TubeTools DB] Conectando ao banco TubeTools...");
    
    tubetoolsSql = postgres(connectionString, {
      max: 10, // Menos conexões que o banco principal
      idle_timeout: 20,
      connect_timeout: 10,
    });

    console.log("[TubeTools DB] ✅ Conexão estabelecida");
  }

  return tubetoolsSql;
}

/**
 * Verificar se um email existe na tabela users do TubeTools
 * @param email Email do lead para verificar
 * @returns true se o email existe (usuário se cadastrou), false caso contrário
 */
export async function checkIfUserExistsInTubetools(email: string): Promise<boolean> {
  try {
    const sql = getTubetoolsDb();
    
    if (!sql) {
      console.warn("[TubeTools DB] Banco não disponível, retornando false");
      return false;
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    const result = await sql`
      SELECT id FROM users 
      WHERE email = ${normalizedEmail}
      LIMIT 1
    `;

    const exists = result.length > 0;
    
    console.log(`[TubeTools DB] Email ${normalizedEmail}: ${exists ? "✅ Encontrado" : "❌ Não encontrado"}`);
    
    return exists;
  } catch (error) {
    console.error("[TubeTools DB] Erro ao verificar email:", error);
    return false;
  }
}

/**
 * Verificar múltiplos emails de uma vez (mais eficiente)
 * @param emails Lista de emails para verificar
 * @returns Objeto com email como chave e boolean como valor
 */
export async function checkMultipleUsersInTubetools(emails: string[]): Promise<Record<string, boolean>> {
  try {
    const sql = getTubetoolsDb();
    
    if (!sql) {
      console.warn("[TubeTools DB] Banco não disponível");
      return {};
    }

    const normalizedEmails = emails.map(e => e.toLowerCase().trim());
    
    const result = await sql`
      SELECT email FROM users 
      WHERE email = ANY(${normalizedEmails})
    `;

    const existingEmails = new Set(result.map((r: any) => r.email));
    
    const resultMap: Record<string, boolean> = {};
    normalizedEmails.forEach(email => {
      resultMap[email] = existingEmails.has(email);
    });

    console.log(`[TubeTools DB] Verificados ${emails.length} emails, ${existingEmails.size} encontrados`);
    
    return resultMap;
  } catch (error) {
    console.error("[TubeTools DB] Erro ao verificar múltiplos emails:", error);
    return {};
  }
}

/**
 * Fechar conexão com o banco TubeTools
 */
export async function closeTubetoolsDb() {
  if (tubetoolsSql) {
    await tubetoolsSql.end();
    tubetoolsSql = null;
    console.log("[TubeTools DB] Conexão fechada");
  }
}
