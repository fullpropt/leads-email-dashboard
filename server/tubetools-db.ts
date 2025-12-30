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

/**
 * Buscar métricas e estatísticas dos usuários do TubeTools
 */
export async function getTubetoolsAnalytics() {
  try {
    const sql = getTubetoolsDb();
    
    if (!sql) {
      console.warn("[TubeTools DB] Banco não disponível");
      return null;
    }

    // Buscar estatísticas gerais
    const [stats] = await sql`
      SELECT 
        COUNT(*) as total_users,
        MIN(created_at) as first_user_date,
        MAX(created_at) as last_user_date,
        AVG(balance) as avg_balance,
        SUM(balance) as total_balance,
        MAX(voting_streak) as max_voting_streak,
        AVG(voting_streak) as avg_voting_streak,
        COUNT(CASE WHEN first_earn_at IS NOT NULL THEN 1 END) as users_with_earnings,
        AVG(voting_days_count) as avg_voting_days
      FROM users
    `;

    // Buscar usuários mais ativos (por saldo)
    const topUsersByBalance = await sql`
      SELECT id, name, email, balance, voting_streak, voting_days_count, created_at
      FROM users
      ORDER BY balance DESC
      LIMIT 10
    `;

    // Buscar usuários com maior streak
    const topUsersByStreak = await sql`
      SELECT id, name, email, balance, voting_streak, voting_days_count, last_voted_at
      FROM users
      WHERE voting_streak > 0
      ORDER BY voting_streak DESC
      LIMIT 10
    `;

    // Buscar novos usuários (últimos 7 dias)
    const recentUsers = await sql`
      SELECT COUNT(*) as count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `;

    // Buscar usuários ativos (votaram nos últimos 7 dias)
    const activeUsers = await sql`
      SELECT COUNT(*) as count
      FROM users
      WHERE last_voted_at >= NOW() - INTERVAL '7 days'
    `;

    // Buscar total de votos
    const [votesStats] = await sql`
      SELECT 
        COUNT(*) as total_votes,
        SUM(reward_amount) as total_rewards_distributed
      FROM votes
    `;

    // Buscar distribuição de usuários por data de criação (últimos 30 dias)
    const userGrowth = await sql`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    console.log("[TubeTools DB] ✅ Analytics recuperadas com sucesso");

    return {
      stats: {
        totalUsers: Number(stats.total_users),
        firstUserDate: stats.first_user_date,
        lastUserDate: stats.last_user_date,
        avgBalance: Number(stats.avg_balance),
        totalBalance: Number(stats.total_balance),
        maxVotingStreak: Number(stats.max_voting_streak),
        avgVotingStreak: Number(stats.avg_voting_streak),
        usersWithEarnings: Number(stats.users_with_earnings),
        avgVotingDays: Number(stats.avg_voting_days),
        recentUsers: Number(recentUsers[0].count),
        activeUsers: Number(activeUsers[0].count),
      },
      votes: {
        totalVotes: Number(votesStats.total_votes),
        totalRewardsDistributed: Number(votesStats.total_rewards_distributed),
      },
      topUsersByBalance,
      topUsersByStreak,
      userGrowth,
    };
  } catch (error) {
    console.error("[TubeTools DB] Erro ao buscar analytics:", error);
    return null;
  }
}

/**
 * Buscar informações detalhadas de um usuário específico por email
 */
export async function getTubetoolsUserByEmail(email: string) {
  try {
    const sql = getTubetoolsDb();
    
    if (!sql) {
      console.warn("[TubeTools DB] Banco não disponível");
      return null;
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    const [user] = await sql`
      SELECT 
        id, email, name, balance, created_at, updated_at,
        first_earn_at, voting_streak, last_voted_at, 
        last_vote_date_reset, voting_days_count
      FROM users 
      WHERE email = ${normalizedEmail}
      LIMIT 1
    `;

    if (!user) {
      return null;
    }

    // Buscar total de votos do usuário
    const [votesCount] = await sql`
      SELECT COUNT(*) as total_votes
      FROM votes
      WHERE user_id = ${user.id}
    `;

    // Buscar total ganho
    const [earnings] = await sql`
      SELECT SUM(reward_amount) as total_earned
      FROM votes
      WHERE user_id = ${user.id}
    `;

    return {
      ...user,
      totalVotes: Number(votesCount.total_votes),
      totalEarned: Number(earnings.total_earned || 0),
    };
  } catch (error) {
    console.error("[TubeTools DB] Erro ao buscar usuário:", error);
    return null;
  }
}
