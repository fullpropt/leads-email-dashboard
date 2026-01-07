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

/**
 * Buscar distribuição de votos por hora do dia
 * @returns Array com contagem de votos por hora (0-23)
 */
export async function getVotesByHour() {
  try {
    const sql = getTubetoolsDb();
    
    if (!sql) {
      return [];
    }

    const result = await sql`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as count
      FROM votes
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `;

    return result.map((row: any) => ({
      hour: parseInt(row.hour),
      count: parseInt(row.count),
    }));
  } catch (error) {
    console.error("[TubeTools DB] Erro ao buscar votos por hora:", error);
    return [];
  }
}

/**
 * Buscar distribuição de votos por dia da semana
 * @returns Array com contagem de votos por dia (0=Domingo, 6=Sábado)
 */
export async function getVotesByDayOfWeek() {
  try {
    const sql = getTubetoolsDb();
    
    if (!sql) {
      return [];
    }

    const result = await sql`
      SELECT 
        EXTRACT(DOW FROM created_at) as day_of_week,
        COUNT(*) as count
      FROM votes
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY EXTRACT(DOW FROM created_at)
      ORDER BY day_of_week
    `;

    const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

    return result.map((row: any) => ({
      dayOfWeek: parseInt(row.day_of_week),
      dayName: dayNames[parseInt(row.day_of_week)],
      count: parseInt(row.count),
    }));
  } catch (error) {
    console.error("[TubeTools DB] Erro ao buscar votos por dia da semana:", error);
    return [];
  }
}

/**
 * Buscar cadastros de usuários por dia (últimos 30 dias)
 * @returns Array com contagem de cadastros por dia
 */
export async function getUserSignupsByDay() {
  try {
    const sql = getTubetoolsDb();
    
    if (!sql) {
      return [];
    }

    const result = await sql`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `;

    return result.map((row: any) => ({
      date: row.date,
      count: parseInt(row.count),
    }));
  } catch (error) {
    console.error("[TubeTools DB] Erro ao buscar cadastros por dia:", error);
    return [];
  }
}

/**
 * Buscar ganhos (recompensas) distribuídos por dia (últimos 30 dias)
 * @returns Array com soma de recompensas por dia
 */
export async function getEarningsByDay() {
  try {
    const sql = getTubetoolsDb();
    
    if (!sql) {
      return [];
    }

    const result = await sql`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as vote_count,
        SUM(reward_amount) as total_rewards
      FROM votes
      WHERE created_at >= NOW() - INTERVAL '30 days'
        AND reward_amount > 0
      GROUP BY DATE(created_at)
      ORDER BY date
    `;

    return result.map((row: any) => ({
      date: row.date,
      voteCount: parseInt(row.vote_count),
      totalRewards: parseFloat(row.total_rewards || 0),
    }));
  } catch (error) {
    console.error("[TubeTools DB] Erro ao buscar ganhos por dia:", error);
    return [];
  }
}

/**
 * Buscar usuários ativos por dia (últimos 30 dias)
 * Usuário ativo = votou naquele dia
 * @returns Array com contagem de usuários ativos por dia
 */
export async function getActiveUsersByDay() {
  try {
    const sql = getTubetoolsDb();
    
    if (!sql) {
      return [];
    }

    const result = await sql`
      SELECT 
        DATE(created_at) as date,
        COUNT(DISTINCT user_id) as active_users
      FROM votes
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `;

    return result.map((row: any) => ({
      date: row.date,
      activeUsers: parseInt(row.active_users),
    }));
  } catch (error) {
    console.error("[TubeTools DB] Erro ao buscar usuários ativos por dia:", error);
    return [];
  }
}

/**
 * Buscar todos os dados temporais de uma vez (otimizado)
 * @returns Objeto com todos os dados temporais
 */
export async function getTemporalAnalytics() {
  try {
    const [
      votesByHour,
      votesByDayOfWeek,
      userSignupsByDay,
      earningsByDay,
      activeUsersByDay,
    ] = await Promise.all([
      getVotesByHour(),
      getVotesByDayOfWeek(),
      getUserSignupsByDay(),
      getEarningsByDay(),
      getActiveUsersByDay(),
    ]);

    return {
      votesByHour,
      votesByDayOfWeek,
      userSignupsByDay,
      earningsByDay,
      activeUsersByDay,
    };
  } catch (error) {
    console.error("[TubeTools DB] Erro ao buscar analytics temporais:", error);
    return {
      votesByHour: [],
      votesByDayOfWeek: [],
      userSignupsByDay: [],
      earningsByDay: [],
      activeUsersByDay: [],
    };
  }
}


/**
 * Buscar informações completas de um usuário específico por email
 * Inclui saldo, histórico de transações, votos, saques e estatísticas
 */
export async function getFullUserDetailsByEmail(email: string) {
  try {
    const sql = getTubetoolsDb();
    
    if (!sql) {
      console.warn("[TubeTools DB] Banco não disponível");
      return null;
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    // Buscar dados do usuário
    const [user] = await sql`
      SELECT 
        id, email, name, balance, created_at, updated_at,
        first_earn_at, voting_streak, last_voted_at, 
        last_vote_date_reset, voting_days_count, daily_votes_left,
        daily_videos_watched, last_daily_reset
      FROM users 
      WHERE email = ${normalizedEmail}
      LIMIT 1
    `;

    if (!user) {
      return null;
    }

    // Buscar histórico de transações
    const transactions = await sql`
      SELECT id, type, amount, description, status, created_at
      FROM transactions
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 50
    `;

    // Buscar histórico de votos com detalhes dos vídeos
    const votes = await sql`
      SELECT v.id, v.video_id, v.vote_type, v.reward_amount, v.created_at,
             vi.title as video_title
      FROM votes v
      LEFT JOIN videos vi ON v.video_id = vi.id
      WHERE v.user_id = ${user.id}
      ORDER BY v.created_at DESC
      LIMIT 50
    `;

    // Buscar histórico de saques
    const withdrawals = await sql`
      SELECT id, amount, status, requested_at, processed_at, bank_details
      FROM withdrawals
      WHERE user_id = ${user.id}
      ORDER BY requested_at DESC
    `;

    // Calcular estatísticas
    const [stats] = await sql`
      SELECT 
        COUNT(*) as total_votes,
        COALESCE(SUM(reward_amount), 0) as total_earned,
        MIN(created_at) as first_vote_at,
        MAX(created_at) as last_vote_at
      FROM votes
      WHERE user_id = ${user.id}
    `;

    // Calcular total de saques aprovados
    const [withdrawalStats] = await sql`
      SELECT 
        COUNT(*) as total_withdrawals,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as total_withdrawn,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_withdrawals
      FROM withdrawals
      WHERE user_id = ${user.id}
    `;

    // Calcular dias ativos (dias únicos com votos)
    const [activeDays] = await sql`
      SELECT COUNT(DISTINCT DATE(created_at)) as active_days
      FROM votes
      WHERE user_id = ${user.id}
    `;

    console.log(`[TubeTools DB] ✅ Detalhes completos recuperados para ${normalizedEmail}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        balance: Number(user.balance),
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        firstEarnAt: user.first_earn_at,
        votingStreak: Number(user.voting_streak),
        lastVotedAt: user.last_voted_at,
        lastVoteDateReset: user.last_vote_date_reset,
        votingDaysCount: Number(user.voting_days_count),
        dailyVotesLeft: Number(user.daily_votes_left),
        dailyVideosWatched: Number(user.daily_videos_watched),
        lastDailyReset: user.last_daily_reset,
      },
      stats: {
        totalVotes: Number(stats.total_votes),
        totalEarned: Number(stats.total_earned),
        firstVoteAt: stats.first_vote_at,
        lastVoteAt: stats.last_vote_at,
        activeDays: Number(activeDays.active_days),
        totalWithdrawals: Number(withdrawalStats.total_withdrawals),
        totalWithdrawn: Number(withdrawalStats.total_withdrawn),
        pendingWithdrawals: Number(withdrawalStats.pending_withdrawals),
      },
      transactions: transactions.map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        description: t.description,
        status: t.status,
        createdAt: t.created_at,
      })),
      votes: votes.map((v: any) => ({
        id: v.id,
        videoId: v.video_id,
        videoTitle: v.video_title,
        voteType: v.vote_type,
        rewardAmount: Number(v.reward_amount),
        createdAt: v.created_at,
      })),
      withdrawals: withdrawals.map((w: any) => ({
        id: w.id,
        amount: Number(w.amount),
        status: w.status,
        requestedAt: w.requested_at,
        processedAt: w.processed_at,
        bankDetails: w.bank_details,
      })),
    };
  } catch (error) {
    console.error("[TubeTools DB] Erro ao buscar detalhes completos do usuário:", error);
    return null;
  }
}
