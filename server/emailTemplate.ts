/**
 * Sistema de template de email com header, rodapé e estilos CSS padrão TubeTools
 * 
 * Este módulo fornece funções para criar emails com identidade visual consistente.
 * Inclui:
 * - Header com logo TubeTools
 * - Footer com link de unsubscribe automático
 * - Estilos CSS padronizados
 * - Conversão automática de texto simples para HTML formatado
 */

// URL base da aplicação (configurável via variável de ambiente)
const APP_BASE_URL = process.env.APP_BASE_URL || "https://tubetoolsmailmkt-production.up.railway.app";

/**
 * Estilos CSS inline padrão para emails TubeTools
 * Baseado no template WelcomeAproved-Email
 */
export const EMAIL_STYLES = {
  // Títulos
  h1: "font-size: 28px; font-weight: bold; color: #000000; margin-bottom: 20px;",
  h2: "font-size: 24px; font-weight: bold; color: #000000; margin-bottom: 18px;",
  h3: "font-size: 18px; font-weight: bold; color: #000000; margin: 0 0 5px 0;",
  
  // Parágrafos
  p: "font-size: 16px; color: #333333; margin-bottom: 25px; line-height: 1.6;",
  pSmall: "font-size: 15px; color: #333333; margin: 0; line-height: 1.6;",
  
  // Botões
  button: "display: inline-block; padding: 14px 35px; background-color: #FF0000; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;",
  
  // Links
  link: "color: #FF0000; text-decoration: none;",
  
  // Números de passos
  stepNumber: "font-size: 24px; font-weight: bold; color: #FF0000; padding-right: 15px;",
  
  // Container
  container: "max-width: 600px; margin: 0 auto; background-color: #ffffff;",
  contentWrapper: "padding: 30px 40px; color: #000000; font-family: Arial, sans-serif; font-size: 16px; line-height: 1.6;",
};

/**
 * Gera o header padrão do email TubeTools
 */
export function getEmailHeader(): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; padding: 30px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" style="padding: 20px 0;">
                <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663266054093/HaAhrQWlddPFPJjs.png" alt="TubeTools" style="max-width: 250px; height: auto;" />
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Gera o rodapé padrão do email TubeTools com link de unsubscribe
 * @param unsubscribeToken - Token único para o link de unsubscribe (opcional)
 */
export function getEmailFooter(unsubscribeToken?: string): string {
  const unsubscribeLink = unsubscribeToken 
    ? `${APP_BASE_URL}/unsubscribe/${unsubscribeToken}`
    : "#";
  
  const unsubscribeSection = unsubscribeToken ? `
    <p style="margin: 15px 0 0 0; font-size: 12px; color: #999999;">
      Don't want to receive these emails? 
      <a href="${unsubscribeLink}" style="color: #999999; text-decoration: underline;">Unsubscribe here</a>
    </p>
  ` : '';

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5; padding: 30px 0; margin-top: 40px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" style="padding: 20px; color: #666666; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">
                <p style="margin: 0 0 10px 0; font-weight: bold; color: #000000;">TubeTools</p>
                <p style="margin: 0 0 10px 0;">Watch. Rate. Participate.</p>
                <p style="margin: 0 0 5px 0;">
                  <strong>Support:</strong> 
                  <a href="mailto:supfullpropt@gmail.com" style="color: #FF0000; text-decoration: none;">supfullpropt@gmail.com</a>
                </p>
                <p style="margin: 20px 0 0 0; font-size: 12px; color: #999999;">
                  © ${new Date().getFullYear()} TubeTools. All rights reserved.
                </p>
                ${unsubscribeSection}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Aplica estilos CSS inline automaticamente ao conteúdo HTML
 * Detecta tags HTML e aplica os estilos padrão
 * @param content - Conteúdo HTML
 */
export function applyInlineStyles(content: string): string {
  let styledContent = content;
  
  // Aplicar estilos a tags H1 que não têm style
  styledContent = styledContent.replace(
    /<h1(?![^>]*style=)([^>]*)>/gi,
    `<h1$1 style="${EMAIL_STYLES.h1}">`
  );
  
  // Aplicar estilos a tags H2 que não têm style
  styledContent = styledContent.replace(
    /<h2(?![^>]*style=)([^>]*)>/gi,
    `<h2$1 style="${EMAIL_STYLES.h2}">`
  );
  
  // Aplicar estilos a tags H3 que não têm style
  styledContent = styledContent.replace(
    /<h3(?![^>]*style=)([^>]*)>/gi,
    `<h3$1 style="${EMAIL_STYLES.h3}">`
  );
  
  // Aplicar estilos a tags P que não têm style
  styledContent = styledContent.replace(
    /<p(?![^>]*style=)([^>]*)>/gi,
    `<p$1 style="${EMAIL_STYLES.p}">`
  );
  
  // Aplicar estilos a links que não têm style
  styledContent = styledContent.replace(
    /<a(?![^>]*style=)([^>]*href=[^>]*)>/gi,
    `<a$1 style="${EMAIL_STYLES.link}">`
  );
  
  return styledContent;
}

/**
 * Converte texto simples em HTML formatado com estilos TubeTools
 * Detecta automaticamente:
 * - Títulos (linhas que começam com # ou são curtas e seguidas de linha vazia)
 * - Parágrafos
 * - Listas (linhas que começam com - ou *)
 * - Links (URLs)
 * - Botões (linhas que começam com [BUTTON])
 * 
 * @param text - Texto simples ou parcialmente formatado
 */
export function convertTextToHtml(text: string): string {
  // Se já é HTML completo, retornar como está
  if (text.trim().toLowerCase().startsWith('<!doctype') || 
      text.trim().toLowerCase().startsWith('<html')) {
    return text;
  }
  
  // Se já contém tags HTML significativas, apenas aplicar estilos
  const hasHtmlTags = /<(h[1-6]|p|div|table|tr|td|ul|ol|li|a|img|br|hr)\b/i.test(text);
  if (hasHtmlTags) {
    return applyInlineStyles(text);
  }
  
  // Converter texto simples para HTML
  const lines = text.split('\n');
  let html = '';
  let inList = false;
  let listType = '';
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    if (!line) {
      // Linha vazia - fechar lista se estiver aberta
      if (inList) {
        html += `</${listType}>`;
        inList = false;
      }
      continue;
    }
    
    // Detectar títulos com #
    if (line.startsWith('### ')) {
      if (inList) { html += `</${listType}>`; inList = false; }
      html += `<h3 style="${EMAIL_STYLES.h3}">${line.substring(4)}</h3>\n`;
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { html += `</${listType}>`; inList = false; }
      html += `<h2 style="${EMAIL_STYLES.h2}">${line.substring(3)}</h2>\n`;
      continue;
    }
    if (line.startsWith('# ')) {
      if (inList) { html += `</${listType}>`; inList = false; }
      html += `<h1 style="${EMAIL_STYLES.h1}">${line.substring(2)}</h1>\n`;
      continue;
    }
    
    // Detectar botões [BUTTON:texto:url]
    const buttonMatch = line.match(/\[BUTTON:([^:]+):([^\]]+)\]/i);
    if (buttonMatch) {
      if (inList) { html += `</${listType}>`; inList = false; }
      html += `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;">
          <tr>
            <td align="center">
              <a href="${buttonMatch[2]}" target="_blank" style="${EMAIL_STYLES.button}">
                ${buttonMatch[1]}
              </a>
            </td>
          </tr>
        </table>\n`;
      continue;
    }
    
    // Detectar listas
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        listType = 'ul';
        html += '<ul style="margin: 0 0 25px 20px; padding: 0;">';
        inList = true;
      }
      html += `<li style="margin-bottom: 10px; color: #333333;">${line.substring(2)}</li>\n`;
      continue;
    }
    
    // Detectar listas numeradas
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      if (!inList) {
        listType = 'ol';
        html += '<ol style="margin: 0 0 25px 20px; padding: 0;">';
        inList = true;
      }
      html += `<li style="margin-bottom: 10px; color: #333333;">${numberedMatch[2]}</li>\n`;
      continue;
    }
    
    // Fechar lista se não é item de lista
    if (inList) {
      html += `</${listType}>`;
      inList = false;
    }
    
    // Converter URLs em links
    line = line.replace(
      /(https?:\/\/[^\s<]+)/g,
      `<a href="$1" style="${EMAIL_STYLES.link}">$1</a>`
    );
    
    // Converter **texto** em negrito
    line = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Converter *texto* em itálico
    line = line.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Parágrafo normal
    html += `<p style="${EMAIL_STYLES.p}">${line}</p>\n`;
  }
  
  // Fechar lista se ainda estiver aberta
  if (inList) {
    html += `</${listType}>`;
  }
  
  return html;
}

/**
 * Envolve o conteúdo do email com header e rodapé padrão
 * 
 * @param content - Conteúdo HTML do corpo do email
 * @param unsubscribeToken - Token único para o link de unsubscribe (opcional)
 * @returns HTML completo com header, conteúdo e rodapé
 */
export function wrapEmailContent(content: string, unsubscribeToken?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>TubeTools</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      background-color: #f9f9f9;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .content-wrapper {
      padding: 30px 40px;
    }
    a {
      color: #FF0000;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .button {
      display: inline-block;
      padding: 14px 35px;
      background-color: #FF0000;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 8px;
      font-weight: bold;
      font-size: 16px;
    }
    .button:hover {
      background-color: #CC0000;
      text-decoration: none;
    }
    /* Responsive */
    @media only screen and (max-width: 620px) {
      .email-container {
        width: 100% !important;
      }
      .content-wrapper {
        padding: 20px !important;
      }
    }
  </style>
</head>
<body>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f9f9f9;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- HEADER -->
          <tr>
            <td>
              ${getEmailHeader()}
            </td>
          </tr>
          
          <!-- CONTENT -->
          <tr>
            <td class="content-wrapper" style="padding: 30px 40px; color: #000000; font-family: Arial, sans-serif; font-size: 16px; line-height: 1.6;">
              ${content}
            </td>
          </tr>
          
          <!-- FOOTER -->
          <tr>
            <td>
              ${getEmailFooter(unsubscribeToken)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Processa o template de email completo
 * - Converte texto simples para HTML se necessário
 * - Aplica estilos CSS inline
 * - Adiciona header e footer com unsubscribe
 * 
 * @param htmlContent - Conteúdo HTML ou texto simples original
 * @param unsubscribeToken - Token único para o link de unsubscribe (opcional)
 * @returns HTML processado e completo
 */
export function processEmailTemplate(htmlContent: string, unsubscribeToken?: string): string {
  // Se o HTML já tem DOCTYPE e estrutura completa, apenas adicionar unsubscribe ao footer
  if (htmlContent.trim().toLowerCase().startsWith('<!doctype') || 
      htmlContent.trim().toLowerCase().startsWith('<html')) {
    // Tentar adicionar link de unsubscribe ao footer existente
    if (unsubscribeToken) {
      const unsubscribeLink = `${APP_BASE_URL}/unsubscribe/${unsubscribeToken}`;
      const unsubscribeHtml = `
        <p style="margin: 15px 0 0 0; font-size: 12px; color: #999999; text-align: center;">
          Don't want to receive these emails? 
          <a href="${unsubscribeLink}" style="color: #999999; text-decoration: underline;">Unsubscribe here</a>
        </p>
      `;
      
      // Inserir antes do </body>
      if (htmlContent.includes('</body>')) {
        return htmlContent.replace('</body>', `${unsubscribeHtml}</body>`);
      }
    }
    return htmlContent;
  }
  
  // Converter texto para HTML se necessário
  const htmlBody = convertTextToHtml(htmlContent);
  
  // Aplicar estilos inline
  const styledContent = applyInlineStyles(htmlBody);
  
  // Envolver com header e footer
  return wrapEmailContent(styledContent, unsubscribeToken);
}

/**
 * Substitui variáveis do template com dados do lead
 * Variáveis suportadas: {{nome}}, {{email}}, {{produto}}, {{plano}}, {{valor}}
 * 
 * @param template - Template HTML com variáveis
 * @param lead - Dados do lead
 */
export function replaceTemplateVariables(template: string, lead: {
  nome: string;
  email: string;
  produto?: string | null;
  plano?: string | null;
  valor?: number;
}): string {
  let result = template;
  
  // Substituir variáveis
  result = result.replace(/\{\{nome\}\}/gi, lead.nome || 'User');
  result = result.replace(/\{\{email\}\}/gi, lead.email || '');
  result = result.replace(/\{\{produto\}\}/gi, lead.produto || 'TubeTools');
  result = result.replace(/\{\{plano\}\}/gi, lead.plano || '');
  
  // Formatar valor como moeda
  if (lead.valor !== undefined) {
    const valorFormatado = (lead.valor / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD'
    });
    result = result.replace(/\{\{valor\}\}/gi, valorFormatado);
  } else {
    result = result.replace(/\{\{valor\}\}/gi, '');
  }
  
  return result;
}
