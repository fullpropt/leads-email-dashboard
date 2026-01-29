/**
 * NOVO ARQUIVO: server/imap-support.ts
 * 
 * Sistema de suporte por email usando IMAP da Hostinger
 * Substitui o webhook do Mailgun por busca direta via IMAP
 */

import Imap from "imap";
import { simpleParser, ParsedMail } from "mailparser";
import { Readable } from "stream";

// Configuração IMAP da Hostinger
const IMAP_CONFIG = {
  user: process.env.HOSTINGER_SMTP_USER || "noreply@tubetoolsup.uk",
  password: process.env.HOSTINGER_SMTP_PASS || "",
  host: "imap.hostinger.com",
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
};

interface EmailMessage {
  messageId: string | null;
  sender: string;
  senderName: string | null;
  recipient: string;
  subject: string;
  bodyPlain: string | null;
  bodyHtml: string | null;
  receivedAt: Date;
  uid: number;
}

/**
 * Conectar ao servidor IMAP
 */
function createImapConnection(): Promise<Imap> {
  return new Promise((resolve, reject) => {
    const imap = new Imap(IMAP_CONFIG);

    imap.once("ready", () => {
      console.log("[IMAP] ✅ Conectado ao servidor IMAP");
      resolve(imap);
    });

    imap.once("error", (err: Error) => {
      console.error("[IMAP] ❌ Erro de conexão:", err.message);
      reject(err);
    });

    imap.once("end", () => {
      console.log("[IMAP] 📭 Conexão encerrada");
    });

    imap.connect();
  });
}

/**
 * Buscar emails não lidos da caixa de entrada
 */
export async function fetchUnreadEmails(): Promise<EmailMessage[]> {
  const emails: EmailMessage[] = [];

  try {
    const imap = await createImapConnection();

    return new Promise((resolve, reject) => {
      imap.openBox("INBOX", false, (err, box) => {
        if (err) {
          console.error("[IMAP] ❌ Erro ao abrir INBOX:", err.message);
          imap.end();
          reject(err);
          return;
        }

        console.log(`[IMAP] 📬 INBOX aberta - ${box.messages.total} mensagens totais`);

        // Buscar emails não lidos
        imap.search(["UNSEEN"], (searchErr, results) => {
          if (searchErr) {
            console.error("[IMAP] ❌ Erro na busca:", searchErr.message);
            imap.end();
            reject(searchErr);
            return;
          }

          if (!results || results.length === 0) {
            console.log("[IMAP] 📭 Nenhum email não lido encontrado");
            imap.end();
            resolve([]);
            return;
          }

          console.log(`[IMAP] 📧 ${results.length} email(s) não lido(s) encontrado(s)`);

          const fetch = imap.fetch(results, {
            bodies: "",
            struct: true,
            markSeen: false, // Não marcar como lido automaticamente
          });

          fetch.on("message", (msg, seqno) => {
            let uid = 0;

            msg.on("attributes", (attrs) => {
              uid = attrs.uid;
            });

            msg.on("body", (stream: Readable) => {
              simpleParser(stream, (parseErr, parsed: ParsedMail) => {
                if (parseErr) {
                  console.error("[IMAP] ❌ Erro ao parsear email:", parseErr.message);
                  return;
                }

                const email: EmailMessage = {
                  messageId: parsed.messageId || null,
                  sender: typeof parsed.from?.value[0]?.address === "string" 
                    ? parsed.from.value[0].address 
                    : "",
                  senderName: parsed.from?.value[0]?.name || null,
                  recipient: typeof parsed.to === "object" && "value" in parsed.to
                    ? parsed.to.value[0]?.address || ""
                    : "",
                  subject: parsed.subject || "(Sem assunto)",
                  bodyPlain: parsed.text || null,
                  bodyHtml: parsed.html || null,
                  receivedAt: parsed.date || new Date(),
                  uid,
                };

                emails.push(email);
                console.log(`[IMAP] ✅ Email processado: ${email.subject} de ${email.sender}`);
              });
            });
          });

          fetch.once("error", (fetchErr) => {
            console.error("[IMAP] ❌ Erro no fetch:", fetchErr.message);
            imap.end();
            reject(fetchErr);
          });

          fetch.once("end", () => {
            console.log(`[IMAP] ✅ ${emails.length} email(s) processado(s)`);
            imap.end();
            // Aguardar um pouco para garantir que todos os emails foram parseados
            setTimeout(() => resolve(emails), 1000);
          });
        });
      });
    });
  } catch (error) {
    console.error("[IMAP] ❌ Erro geral:", error);
    return [];
  }
}

/**
 * Marcar email como lido
 */
export async function markEmailAsRead(uid: number): Promise<boolean> {
  try {
    const imap = await createImapConnection();

    return new Promise((resolve) => {
      imap.openBox("INBOX", false, (err) => {
        if (err) {
          console.error("[IMAP] ❌ Erro ao abrir INBOX:", err.message);
          imap.end();
          resolve(false);
          return;
        }

        imap.addFlags(uid, ["\\Seen"], (flagErr) => {
          if (flagErr) {
            console.error("[IMAP] ❌ Erro ao marcar como lido:", flagErr.message);
            imap.end();
            resolve(false);
            return;
          }

          console.log(`[IMAP] ✅ Email UID ${uid} marcado como lido`);
          imap.end();
          resolve(true);
        });
      });
    });
  } catch (error) {
    console.error("[IMAP] ❌ Erro ao marcar como lido:", error);
    return false;
  }
}

/**
 * Buscar todos os emails (lidos e não lidos) dos últimos N dias
 */
export async function fetchRecentEmails(daysBack: number = 7): Promise<EmailMessage[]> {
  const emails: EmailMessage[] = [];

  try {
    const imap = await createImapConnection();

    return new Promise((resolve, reject) => {
      imap.openBox("INBOX", true, (err, box) => {
        if (err) {
          console.error("[IMAP] ❌ Erro ao abrir INBOX:", err.message);
          imap.end();
          reject(err);
          return;
        }

        // Calcular data de corte
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - daysBack);
        const sinceDateStr = sinceDate.toISOString().split("T")[0];

        console.log(`[IMAP] 🔍 Buscando emails desde ${sinceDateStr}`);

        // Buscar emails desde a data
        imap.search([["SINCE", sinceDateStr]], (searchErr, results) => {
          if (searchErr) {
            console.error("[IMAP] ❌ Erro na busca:", searchErr.message);
            imap.end();
            reject(searchErr);
            return;
          }

          if (!results || results.length === 0) {
            console.log("[IMAP] 📭 Nenhum email encontrado no período");
            imap.end();
            resolve([]);
            return;
          }

          console.log(`[IMAP] 📧 ${results.length} email(s) encontrado(s)`);

          const fetch = imap.fetch(results, {
            bodies: "",
            struct: true,
          });

          fetch.on("message", (msg, seqno) => {
            let uid = 0;

            msg.on("attributes", (attrs) => {
              uid = attrs.uid;
            });

            msg.on("body", (stream: Readable) => {
              simpleParser(stream, (parseErr, parsed: ParsedMail) => {
                if (parseErr) {
                  console.error("[IMAP] ❌ Erro ao parsear email:", parseErr.message);
                  return;
                }

                const email: EmailMessage = {
                  messageId: parsed.messageId || null,
                  sender: typeof parsed.from?.value[0]?.address === "string"
                    ? parsed.from.value[0].address
                    : "",
                  senderName: parsed.from?.value[0]?.name || null,
                  recipient: typeof parsed.to === "object" && "value" in parsed.to
                    ? parsed.to.value[0]?.address || ""
                    : "",
                  subject: parsed.subject || "(Sem assunto)",
                  bodyPlain: parsed.text || null,
                  bodyHtml: parsed.html || null,
                  receivedAt: parsed.date || new Date(),
                  uid,
                };

                emails.push(email);
              });
            });
          });

          fetch.once("error", (fetchErr) => {
            console.error("[IMAP] ❌ Erro no fetch:", fetchErr.message);
            imap.end();
            reject(fetchErr);
          });

          fetch.once("end", () => {
            console.log(`[IMAP] ✅ ${emails.length} email(s) processado(s)`);
            imap.end();
            setTimeout(() => resolve(emails), 1000);
          });
        });
      });
    });
  } catch (error) {
    console.error("[IMAP] ❌ Erro geral:", error);
    return [];
  }
}

/**
 * Importar emails não lidos para o banco de dados de suporte
 */
export async function importUnreadEmailsToSupport(): Promise<{
  success: boolean;
  imported: number;
  skipped: number;
  errors: number;
}> {
  try {
    const { createSupportEmail, getSupportEmailByMessageId } = await import("./support-db");
    
    const emails = await fetchUnreadEmails();
    
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const email of emails) {
      try {
        // Verificar se já existe
        if (email.messageId) {
          const existing = await getSupportEmailByMessageId(email.messageId);
          if (existing) {
            console.log(`[IMAP Import] ⏭️ Email já existe: ${email.subject}`);
            skipped++;
            continue;
          }
        }

        // Criar registro no banco
        const emailId = await createSupportEmail({
          messageId: email.messageId,
          sender: email.sender,
          senderName: email.senderName,
          recipient: email.recipient,
          subject: email.subject,
          bodyPlain: email.bodyPlain,
          bodyHtml: email.bodyHtml,
          strippedText: email.bodyPlain, // Usar body plain como stripped
          strippedSignature: null,
          attachmentCount: 0,
          attachments: null,
          messageHeaders: null,
          mailgunTimestamp: null,
          mailgunToken: null,
          mailgunSignature: null,
          status: "pending",
        });

        if (emailId) {
          imported++;
          console.log(`[IMAP Import] ✅ Email importado: ${email.subject}`);
          
          // Marcar como lido no servidor
          await markEmailAsRead(email.uid);
        } else {
          errors++;
          console.error(`[IMAP Import] ❌ Falha ao importar: ${email.subject}`);
        }
      } catch (err) {
        errors++;
        console.error(`[IMAP Import] ❌ Erro ao processar email:`, err);
      }
    }

    return {
      success: errors === 0,
      imported,
      skipped,
      errors,
    };
  } catch (error) {
    console.error("[IMAP Import] ❌ Erro geral:", error);
    return {
      success: false,
      imported: 0,
      skipped: 0,
      errors: 1,
    };
  }
}

/**
 * Testar conexão IMAP
 */
export async function testImapConnection(): Promise<{
  success: boolean;
  message: string;
  totalMessages?: number;
  unreadMessages?: number;
}> {
  try {
    const imap = await createImapConnection();

    return new Promise((resolve) => {
      imap.openBox("INBOX", true, (err, box) => {
        if (err) {
          imap.end();
          resolve({
            success: false,
            message: `Erro ao abrir INBOX: ${err.message}`,
          });
          return;
        }

        // Contar emails não lidos
        imap.search(["UNSEEN"], (searchErr, results) => {
          const unreadCount = results?.length || 0;
          
          imap.end();
          resolve({
            success: true,
            message: "Conexão IMAP estabelecida com sucesso!",
            totalMessages: box.messages.total,
            unreadMessages: unreadCount,
          });
        });
      });
    });
  } catch (error) {
    return {
      success: false,
      message: `Erro de conexão: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
    };
  }
}