/**
 * Utilitários para detecção e manipulação de fuso horário
 * Usado para enviar emails no horário local do lead
 */

/**
 * Mapeamento de países para fusos horários padrão
 * Usado como fallback quando não conseguimos detectar via IP
 */
const COUNTRY_TIMEZONE_MAP: Record<string, string> = {
  BR: "America/Sao_Paulo",
  US: "America/New_York",
  PT: "Europe/Lisbon",
  ES: "Europe/Madrid",
  AR: "America/Argentina/Buenos_Aires",
  MX: "America/Mexico_City",
  CO: "America/Bogota",
  CL: "America/Santiago",
  PE: "America/Lima",
  UY: "America/Montevideo",
  PY: "America/Asuncion",
  BO: "America/La_Paz",
  EC: "America/Guayaquil",
  VE: "America/Caracas",
  GB: "Europe/London",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  IT: "Europe/Rome",
  JP: "Asia/Tokyo",
  CN: "Asia/Shanghai",
  AU: "Australia/Sydney",
  CA: "America/Toronto",
};

/**
 * Fuso horário padrão quando não conseguimos detectar
 */
const DEFAULT_TIMEZONE = "America/Sao_Paulo";

/**
 * Detecta o fuso horário baseado no IP usando serviço gratuito
 * Usa ip-api.com que é gratuito para uso não comercial (até 45 req/min)
 * 
 * @param ip - Endereço IP do cliente
 * @returns Fuso horário no formato IANA (ex: "America/Sao_Paulo")
 */
export async function detectTimezoneFromIP(ip: string | undefined): Promise<string> {
  // Se não tiver IP, retornar padrão
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    console.log("[Timezone] IP local ou não fornecido, usando timezone padrão:", DEFAULT_TIMEZONE);
    return DEFAULT_TIMEZONE;
  }

  try {
    console.log(`[Timezone] Detectando timezone para IP: ${ip}`);
    
    // Usar ip-api.com (gratuito, até 45 req/min)
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,timezone,countryCode`, {
      signal: AbortSignal.timeout(5000), // Timeout de 5 segundos
    });

    if (!response.ok) {
      console.warn(`[Timezone] Erro na API: ${response.status}`);
      return DEFAULT_TIMEZONE;
    }

    const data = await response.json();
    
    if (data.status === "success" && data.timezone) {
      console.log(`[Timezone] Timezone detectado: ${data.timezone} (País: ${data.countryCode})`);
      return data.timezone;
    }

    // Fallback: usar mapeamento por país
    if (data.countryCode && COUNTRY_TIMEZONE_MAP[data.countryCode]) {
      const fallbackTz = COUNTRY_TIMEZONE_MAP[data.countryCode];
      console.log(`[Timezone] Usando fallback por país (${data.countryCode}): ${fallbackTz}`);
      return fallbackTz;
    }

    console.warn("[Timezone] Não foi possível detectar timezone, usando padrão");
    return DEFAULT_TIMEZONE;

  } catch (error) {
    console.error("[Timezone] Erro ao detectar timezone:", error);
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Detecta o fuso horário baseado no código do país
 * Útil quando o PerfectPay envia informações do país do cliente
 * 
 * @param countryCode - Código do país (ISO 3166-1 alpha-2, ex: "BR", "US")
 * @returns Fuso horário no formato IANA
 */
export function getTimezoneFromCountry(countryCode: string | undefined): string {
  if (!countryCode) {
    return DEFAULT_TIMEZONE;
  }

  const timezone = COUNTRY_TIMEZONE_MAP[countryCode.toUpperCase()];
  if (timezone) {
    console.log(`[Timezone] Timezone por país (${countryCode}): ${timezone}`);
    return timezone;
  }

  console.log(`[Timezone] País ${countryCode} não mapeado, usando padrão: ${DEFAULT_TIMEZONE}`);
  return DEFAULT_TIMEZONE;
}

/**
 * Calcula a data/hora de envio considerando o fuso horário do lead
 * 
 * @param sendTime - Horário de envio desejado no formato "HH:MM" (ex: "18:00")
 * @param delayDays - Número de dias de atraso a partir de agora
 * @param leadTimezone - Fuso horário do lead (IANA format)
 * @returns Data/hora UTC para o envio
 */
export function calculateSendTimeInLeadTimezone(
  sendTime: string,
  delayDays: number,
  leadTimezone: string
): Date {
  try {
    // Extrair hora e minuto do sendTime
    const [hours, minutes] = sendTime.split(":").map(Number);
    
    if (isNaN(hours) || isNaN(minutes)) {
      console.warn(`[Timezone] Horário inválido: ${sendTime}, usando 12:00`);
      return calculateSendTimeInLeadTimezone("12:00", delayDays, leadTimezone);
    }

    // Obter a data atual no fuso horário do lead
    const now = new Date();
    
    // Calcular a data de envio (hoje + delayDays)
    const sendDate = new Date(now);
    sendDate.setDate(sendDate.getDate() + delayDays);
    
    // Criar uma string de data no formato ISO para o fuso horário do lead
    // Usamos a API Intl para formatar a data no timezone do lead
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: leadTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    
    const dateParts = formatter.format(sendDate);
    
    // Criar a data/hora no timezone do lead
    // Formato: "YYYY-MM-DDTHH:MM:00" no timezone do lead
    const dateTimeString = `${dateParts}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
    
    // Converter para UTC usando a diferença de timezone
    const leadDate = new Date(dateTimeString);
    
    // Obter o offset do timezone do lead
    const leadOffset = getTimezoneOffset(leadTimezone, leadDate);
    
    // Ajustar para UTC
    const utcDate = new Date(leadDate.getTime() + leadOffset * 60 * 1000);
    
    console.log(`[Timezone] Horário de envio calculado:`);
    console.log(`  - Horário desejado: ${sendTime} no timezone ${leadTimezone}`);
    console.log(`  - Dias de atraso: ${delayDays}`);
    console.log(`  - Data/hora UTC resultante: ${utcDate.toISOString()}`);
    
    return utcDate;

  } catch (error) {
    console.error("[Timezone] Erro ao calcular horário de envio:", error);
    // Fallback: retornar data atual + delay em dias
    const fallbackDate = new Date();
    fallbackDate.setDate(fallbackDate.getDate() + delayDays);
    return fallbackDate;
  }
}

/**
 * Obtém o offset em minutos de um timezone específico para uma data
 * 
 * @param timezone - Fuso horário IANA
 * @param date - Data para calcular o offset
 * @returns Offset em minutos (positivo = atrás de UTC, negativo = à frente)
 */
function getTimezoneOffset(timezone: string, date: Date): number {
  try {
    // Criar formatadores para UTC e para o timezone específico
    const utcFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    
    const tzFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    
    const utcParts = utcFormatter.formatToParts(date);
    const tzParts = tzFormatter.formatToParts(date);
    
    const getPartValue = (parts: Intl.DateTimeFormatPart[], type: string) => {
      const part = parts.find(p => p.type === type);
      return part ? parseInt(part.value, 10) : 0;
    };
    
    const utcHours = getPartValue(utcParts, "hour");
    const utcMinutes = getPartValue(utcParts, "minute");
    const tzHours = getPartValue(tzParts, "hour");
    const tzMinutes = getPartValue(tzParts, "minute");
    
    const utcTotalMinutes = utcHours * 60 + utcMinutes;
    const tzTotalMinutes = tzHours * 60 + tzMinutes;
    
    return utcTotalMinutes - tzTotalMinutes;
    
  } catch (error) {
    console.error("[Timezone] Erro ao calcular offset:", error);
    return 0; // Assume UTC se houver erro
  }
}

/**
 * Verifica se já passou o horário de envio para um lead em seu timezone
 * 
 * @param sendTime - Horário de envio no formato "HH:MM"
 * @param leadTimezone - Fuso horário do lead
 * @returns true se já passou o horário, false caso contrário
 */
export function hasPassedSendTimeInTimezone(sendTime: string, leadTimezone: string): boolean {
  try {
    const [targetHours, targetMinutes] = sendTime.split(":").map(Number);
    
    // Obter hora atual no timezone do lead
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: leadTimezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    
    const parts = formatter.formatToParts(now);
    const currentHours = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    const currentMinutes = parseInt(parts.find(p => p.type === "minute")?.value || "0", 10);
    
    const currentTotalMinutes = currentHours * 60 + currentMinutes;
    const targetTotalMinutes = targetHours * 60 + targetMinutes;
    
    return currentTotalMinutes >= targetTotalMinutes;
    
  } catch (error) {
    console.error("[Timezone] Erro ao verificar horário:", error);
    return false;
  }
}

/**
 * Verifica se um timezone é válido
 * 
 * @param timezone - String do timezone para validar
 * @returns true se válido, false caso contrário
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Obtém a hora atual em um timezone específico
 * 
 * @param timezone - Fuso horário IANA
 * @returns String formatada com a hora atual (ex: "18:30")
 */
export function getCurrentTimeInTimezone(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return formatter.format(new Date());
  } catch (error) {
    console.error("[Timezone] Erro ao obter hora atual:", error);
    return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
}


/**
 * Calcula a data/hora de envio considerando delay em diferentes unidades (horas, dias, semanas)
 * 
 * COMPORTAMENTO:
 * - Se delayUnit = "hours": adiciona horas à data atual, IGNORA o sendTime
 * - Se delayUnit = "days" ou "weeks": usa o sendTime como horário de envio no timezone do lead
 * 
 * @param delayValue - Valor do delay (número)
 * @param delayUnit - Unidade do delay ("hours", "days", "weeks")
 * @param sendTime - Horário de envio no formato "HH:MM" (usado apenas para dias/semanas)
 * @param leadTimezone - Fuso horário do lead (IANA format)
 * @returns Data/hora UTC para o envio
 */
export function calculateSendTimeWithUnit(
  delayValue: number,
  delayUnit: string,
  sendTime: string | null | undefined,
  leadTimezone: string
): Date {
  try {
    const now = new Date();
    
    // Se a unidade é HORAS, simplesmente adiciona as horas à data atual
    // Neste caso, o sendTime é IGNORADO pois o delay já define o momento exato
    if (delayUnit === "hours") {
      const sendDate = new Date(now.getTime() + delayValue * 60 * 60 * 1000);
      
      console.log(`[Timezone] Horário de envio calculado (HORAS):`);
      console.log(`  - Delay: ${delayValue} hora(s)`);
      console.log(`  - Data/hora UTC resultante: ${sendDate.toISOString()}`);
      console.log(`  - Horário local (${leadTimezone}): ${sendDate.toLocaleString("pt-BR", { timeZone: leadTimezone })}`);
      
      return sendDate;
    }
    
    // Para DIAS ou SEMANAS, usa o sendTime como horário de envio
    // Converte semanas para dias
    const delayDays = delayUnit === "weeks" ? delayValue * 7 : delayValue;
    
    // Usar o horário programado ou padrão 12:00
    const targetTime = sendTime || "12:00";
    
    // Extrair hora e minuto do sendTime
    const [hours, minutes] = targetTime.split(":").map(Number);
    
    if (isNaN(hours) || isNaN(minutes)) {
      console.warn(`[Timezone] Horário inválido: ${targetTime}, usando 12:00`);
      return calculateSendTimeWithUnit(delayValue, delayUnit, "12:00", leadTimezone);
    }

    // Calcular a data de envio (hoje + delayDays)
    const sendDate = new Date(now);
    sendDate.setDate(sendDate.getDate() + delayDays);
    
    // Criar uma string de data no formato ISO para o fuso horário do lead
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: leadTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    
    const dateParts = formatter.format(sendDate);
    
    // Criar a data/hora no timezone do lead
    const dateTimeString = `${dateParts}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
    
    // Converter para UTC usando a diferença de timezone
    const leadDate = new Date(dateTimeString);
    
    // Obter o offset do timezone do lead
    const leadOffset = getTimezoneOffset(leadTimezone, leadDate);
    
    // Ajustar para UTC
    const utcDate = new Date(leadDate.getTime() + leadOffset * 60 * 1000);
    
    console.log(`[Timezone] Horário de envio calculado (${delayUnit.toUpperCase()}):`);
    console.log(`  - Delay: ${delayValue} ${delayUnit} (${delayDays} dias)`);
    console.log(`  - Horário desejado: ${targetTime} no timezone ${leadTimezone}`);
    console.log(`  - Data/hora UTC resultante: ${utcDate.toISOString()}`);
    
    return utcDate;

  } catch (error) {
    console.error("[Timezone] Erro ao calcular horário de envio:", error);
    // Fallback: retornar data atual + delay em horas (assume horas como padrão seguro)
    const fallbackDate = new Date();
    fallbackDate.setTime(fallbackDate.getTime() + delayValue * 60 * 60 * 1000);
    return fallbackDate;
  }
}

/**
 * Função auxiliar para obter o offset de um timezone
 * (Duplicada aqui para evitar dependência circular)
 */
function getTimezoneOffset(timezone: string, date: Date): number {
  try {
    const utcFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    
    const tzFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    
    const utcParts = utcFormatter.formatToParts(date);
    const tzParts = tzFormatter.formatToParts(date);
    
    const getPartValue = (parts: Intl.DateTimeFormatPart[], type: string) => {
      const part = parts.find(p => p.type === type);
      return part ? parseInt(part.value, 10) : 0;
    };
    
    const utcHours = getPartValue(utcParts, "hour");
    const utcMinutes = getPartValue(utcParts, "minute");
    const tzHours = getPartValue(tzParts, "hour");
    const tzMinutes = getPartValue(tzParts, "minute");
    
    const utcTotalMinutes = utcHours * 60 + utcMinutes;
    const tzTotalMinutes = tzHours * 60 + tzMinutes;
    
    return utcTotalMinutes - tzTotalMinutes;
    
  } catch (error) {
    console.error("[Timezone] Erro ao calcular offset:", error);
    return 0;
  }
}
