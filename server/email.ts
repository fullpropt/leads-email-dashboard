import { Resend } from 'resend';

// Resend client
const resendApiKey = process.env.RESEND_API_KEY;
const resendFromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@tubetoolsup.uk';
const resendFromName = process.env.RESEND_FROM_NAME || 'TubeTools';

let resendClient: Resend | null = null;

if (resendApiKey) {
  resendClient = new Resend(resendApiKey);
  console.log('[Resend] ✅ Cliente inicializado');
} else {
  console.warn('[Resend] ⚠️ RESEND_API_KEY não configurada');
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send email using Resend
 */
async function sendWithResend(options: EmailOptions): Promise<boolean> {
  if (!resendClient) {
    console.error('[Resend] ❌ Cliente não inicializado');
    return false;
  }

  try {
    console.log(`[Resend] 📤 Enviando email para: ${options.to}`);
    console.log(`[Resend] 📧 Assunto: ${options.subject}`);
    console.log(`[Resend] 👤 De: ${resendFromEmail}`);

    const { data, error } = await resendClient.emails.send({
      from: `${resendFromName} <${resendFromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });

    if (error) {
      console.error('[Resend] ❌ Erro ao enviar email');
      console.error('[Resend] Erro:', error);
      return false;
    }

    console.log(`[Resend] ✅ Email enviado com sucesso! ID: ${data?.id}`);
    return true;
  } catch (error: any) {
    console.error('[Resend] ❌ Erro ao enviar email');
    console.error('[Resend] Erro:', error.message || error);
    return false;
  }
}

/**
 * Main function to send email
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  console.log(`[Email] Iniciando envio para: ${options.to}`);
  
  // Try Resend
  const success = await sendWithResend(options);
  
  if (success) {
    console.log(`[Email] ✅ Email enviado com sucesso para: ${options.to}`);
  } else {
    console.error(`[Email] ❌ Falha ao enviar email para: ${options.to}`);
  }
  
  return success;
}

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  const subject = 'Welcome to TubeTools!';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">Welcome to TubeTools!</h1>
      <p>Hi ${name},</p>
      <p>Thank you for joining TubeTools. We're excited to have you on board!</p>
      <p>Get started by exploring our platform and discovering all the features we have to offer.</p>
      <br>
      <p>Best regards,</p>
      <p>The TubeTools Team</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 12px; color: #666;">Watch. Rate. Participate.</p>
    </div>
  `;
  
  return sendEmail({ to, subject, html });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<boolean> {
  const subject = 'Reset Your Password';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">Password Reset Request</h1>
      <p>You requested to reset your password. Click the button below to proceed:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Reset Password</a>
      </p>
      <p>If you didn't request this, you can safely ignore this email.</p>
      <p>This link will expire in 24 hours.</p>
      <br>
      <p>Best regards,</p>
      <p>The TubeTools Team</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 12px; color: #666;">Watch. Rate. Participate.</p>
    </div>
  `;
  
  return sendEmail({ to, subject, html });
}

/**
 * Check if email service is configured
 */
export function isEmailServiceConfigured(): boolean {
  return !!resendClient;
}