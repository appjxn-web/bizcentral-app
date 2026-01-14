

import { DocPrefixConfig } from "./types";

export function getNextDocNumber(
  type: string, 
  configs: DocPrefixConfig[] | undefined | null, 
  existingDocs: { id: string }[]
): string {
  const safeConfigs = configs || [];
  
  const config = safeConfigs.find(c => 
    c?.type?.toLowerCase() === type?.toLowerCase()
  );
  
  if (!config || !config.prefix) {
    console.warn(`No valid prefix configuration found for type: ${type}. Using fallback.`);
    const fallbackPrefix = type.substring(0, 2).toUpperCase();
    return `${fallbackPrefix}-${Date.now()}`;
  }

  const prefix = config.prefix;
  const now = new Date();
  
  const yearShort = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dateStr = config.useDate ? `${yearShort}${month}` : '';

  const idPattern = dateStr ? `${prefix}-${dateStr}-` : `${prefix}-`;
  
  let nextNum = config.startNumber || 1;

  const relevantIds = existingDocs
    .map(d => d.id)
    .filter(id => id && typeof id === 'string' && id.startsWith(idPattern));

  if (relevantIds.length > 0) {
    const sequenceNumbers = relevantIds.map(id => {
      const parts = id.split('-');
      const lastPart = parts[parts.length - 1];
      return parseInt(lastPart, 10);
    }).filter(n => !isNaN(n));

    if (sequenceNumbers.length > 0) {
      nextNum = Math.max(...sequenceNumbers) + 1;
    }
  }

  const paddedNum = String(nextNum).padStart(config.digits || 4, '0');
  return dateStr ? `${prefix}-${dateStr}-${paddedNum}` : `${prefix}-${paddedNum}`;
}
