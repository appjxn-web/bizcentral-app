
import { DocPrefixConfig } from "./types";

export function getNextDocNumber(
  type: string, 
  configs: DocPrefixConfig[] | undefined | null, 
  existingDocs: { id: string }[]
): string {
  // 1. Safety Check: If configs is null/undefined, handle gracefully
  const safeConfigs = configs || [];
  
  // 2. Find config (Safe check: c must exist and have a type property)
  const config = safeConfigs.find(c => 
    c?.type?.toLowerCase() === type?.toLowerCase()
  );
  
  // Default fallback if config is missing or invalid
  if (!config || !config.prefix) {
    console.warn(`No valid prefix configuration found for type: ${type}. Using fallback.`);
    const fallbackPrefix = type.substring(0, 2).toUpperCase();
    return `${fallbackPrefix}-${Date.now()}`;
  }

  const prefix = config.prefix;
  const now = new Date();
  
  // 3. Generate the date part (e.g., "2412" for Dec 2024)
  const yearShort = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dateStr = config.useDate ? `${yearShort}${month}` : '';

  // 4. Build the search pattern for the current period (e.g., "SO-2412-")
  const idPattern = dateStr ? `${prefix}-${dateStr}-` : `${prefix}-`;
  
  // 5. Calculate the next sequence number
  let nextNum = config.startNumber || 1;

  const relevantIds = existingDocs
    .map(d => d.id)
    .filter(id => id && typeof id === 'string' && id.startsWith(idPattern));

  if (relevantIds.length > 0) {
    const sequenceNumbers = relevantIds.map(id => {
      const parts = id.split('-');
      // We take the last part of the ID (the number)
      const lastPart = parts[parts.length - 1];
      return parseInt(lastPart, 10);
    }).filter(n => !isNaN(n));

    if (sequenceNumbers.length > 0) {
      nextNum = Math.max(...sequenceNumbers) + 1;
    }
  }

  // 6. Format final ID (e.g., SO-2412-0001)
  const paddedNum = String(nextNum).padStart(config.digits || 4, '0');
  return dateStr ? `${prefix}-${dateStr}-${paddedNum}` : `${prefix}-${paddedNum}`;
}
