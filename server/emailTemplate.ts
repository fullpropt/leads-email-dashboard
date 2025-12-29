/**
 * Sistema de template de email com header e rodapé padrão TubeTools
 * 
 * Este módulo fornece funções para criar emails com identidade visual consistente.
 */

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
 * Gera o rodapé padrão do email TubeTools
 */
export function getEmailFooter(): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5; padding: 30px 0; margin-top: 40px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" style="padding: 20px; color: #666666; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">
                <p style="margin: 0 0 10px 0; font-weight: bold; color: #000000;">TubeTools</p>
                <p style="margin: 0 0 10px 0;">Watch. Vote. Earn.</p>
                <p style="margin: 0 0 5px 0;">
                  <strong>Suporte:</strong> 
                  <a href="mailto:supfullpropt@gmail.com" style="color: #FF0000; text-decoration: none;">supfullpropt@gmail.com</a>
                </p>
                <p style="margin: 20px 0 0 0; font-size: 12px; color: #999999;">
                  © ${new Date().getFullYear()} TubeTools. Todos os direitos reservados.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Envolve o conteúdo do email com header e rodapé padrão
 * 
 * @param content - Conteúdo HTML do corpo do email
 * @returns HTML completo com header, conteúdo e rodapé
 */
export function wrapEmailContent(content: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
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
      padding: 12px 30px;
      background-color: #FF0000;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 5px;
      font-weight: bold;
      margin: 10px 0;
    }
    .button:hover {
      background-color: #CC0000;
      text-decoration: none;
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
              ${getEmailFooter()}
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
 * Verifica se o HTML já contém a estrutura completa (DOCTYPE, html, body)
 * Se sim, retorna o HTML original. Se não, envolve com header e rodapé.
 * 
 * @param htmlContent - Conteúdo HTML original
 * @returns HTML processado
 */
export function processEmailTemplate(htmlContent: string): string {
  // Se o HTML já tem DOCTYPE e estrutura completa, não envolve
  if (htmlContent.trim().toLowerCase().startsWith('<!doctype') || 
      htmlContent.trim().toLowerCase().startsWith('<html')) {
    return htmlContent;
  }
  
  // Caso contrário, envolve com header e rodapé
  return wrapEmailContent(htmlContent);
}
