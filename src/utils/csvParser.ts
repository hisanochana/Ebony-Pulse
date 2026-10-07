import { FactoryName, ProductionLog } from '../types';

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseSheetData(csvText: string): ProductionLog[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];

  const headerCols = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/[\s_-]/g, ''));
  
  // Dynamic header finder
  const getColIdx = (aliases: string[], fallbackIdx: number): number => {
    for (const alias of aliases) {
      const idx = headerCols.indexOf(alias.toLowerCase().replace(/[\s_-]/g, ''));
      if (idx !== -1) return idx;
    }
    return fallbackIdx;
  };

  const hasRecognizedHeaders = headerCols.some(h => 
    ['factory', 'date', 'style', 'actualqty', 'plannedqty', 'supervisor'].includes(h)
  );

  const idxEntryId = hasRecognizedHeaders ? getColIdx(['entryid', 'id', 'entry'], 0) : 0;
  const idxTimestamp = hasRecognizedHeaders ? getColIdx(['timestamp', 'time', 'datetime'], 1) : 1;
  const idxDate = hasRecognizedHeaders ? getColIdx(['date', 'shiftdate'], 2) : 2;
  const idxFactory = hasRecognizedHeaders ? getColIdx(['factory', 'plant', 'location'], 3) : 3;
  const idxLine = hasRecognizedHeaders ? getColIdx(['line', 'sewingline'], 4) : 4;
  const idxLineNo = hasRecognizedHeaders ? getColIdx(['lineno', 'linename', 'linecode'], 5) : 5;
  const idxSupervisor = hasRecognizedHeaders ? getColIdx(['supervisor', 'leader'], 6) : 6;
  const idxStyle = hasRecognizedHeaders ? getColIdx(['style', 'styleno', 'stylenumber'], 7) : 7;
  const idxProduct = hasRecognizedHeaders ? getColIdx(['product', 'category', 'productcategory'], 8) : 8;
  const idxBrand = hasRecognizedHeaders ? getColIdx(['brand', 'customer'], 9) : 9;
  const idxSmv = hasRecognizedHeaders ? getColIdx(['smv', 'sam'], 10) : 10;
  const idxPlannedQty = hasRecognizedHeaders ? getColIdx(['plannedqty', 'targetqty', 'target', 'planqty'], 11) : 11;
  const idxActualQty = hasRecognizedHeaders ? getColIdx(['actualqty', 'output', 'actualoutput', 'producedqty'], 12) : 12;
  const idxProducedMins = hasRecognizedHeaders ? getColIdx(['producedminutes', 'producedmins', 'earnedminutes'], 13) : 13;
  const idxPlanTMs = hasRecognizedHeaders ? getColIdx(['plantms', 'targetoperators', 'plantm'], 14) : 14;
  const idxActualTMs = hasRecognizedHeaders ? getColIdx(['actualtms', 'allocatedtm', 'actualtm'], 15) : 15;
  const idxPresentTMs = hasRecognizedHeaders ? getColIdx(['presenttms', 'attendedtm', 'presenttm'], 16) : 16;
  const idxHoursWorked = hasRecognizedHeaders ? getColIdx(['hoursworked', 'shifthours', 'hours'], 17) : 17;
  const idxWorkedMins = hasRecognizedHeaders ? getColIdx(['workedminutes', 'totalworkedminutes', 'clockminutes'], 18) : 18;
  const idxDownTime = hasRecognizedHeaders ? getColIdx(['downtime', 'losttime', 'downtimemins'], 19) : 19;
  const idxRemarks = hasRecognizedHeaders ? getColIdx(['remarks', 'notes', 'comment'], 20) : 20;
  const idxUser = hasRecognizedHeaders ? getColIdx(['user', 'operator', 'username'], 21) : 21;

  const logs: ProductionLog[] = [];

  const cleanNum = (val: string | undefined): number => {
    if (!val) return 0;
    const cleaned = val.replace(/[",\s]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    if (cols.length < 4) continue;

    const rawDate = cols[idxDate] || cols[2] || '';
    const rawFactory = cols[idxFactory] || cols[3] || '';
    if (!rawDate && !rawFactory && !cols[idxStyle]) continue;

    let validFactory: FactoryName = 'Kurunegala';
    const factoryLower = (rawFactory || '').toLowerCase();
    if (factoryLower.includes('bul') || factoryLower.startsWith('b')) {
      validFactory = 'Bulugolla';
    } else if (factoryLower.includes('wer') || factoryLower.startsWith('w')) {
      validFactory = 'Werapola';
    } else if (factoryLower.includes('kur') || factoryLower.startsWith('k')) {
      validFactory = 'Kurunegala';
    }

    let cleanDate = rawDate.trim();
    if (cleanDate.includes('/')) {
      const parts = cleanDate.split('/');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          cleanDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        } else if (parts[2].length === 4) {
          cleanDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
    } else if (cleanDate.includes('T')) {
      cleanDate = cleanDate.split('T')[0];
    }

    const lineNum = (cols[idxLine] || '1').trim();
    const prefix = validFactory.charAt(0).toUpperCase();
    const explicitLineNo = cols[idxLineNo] ? cols[idxLineNo].trim() : '';
    const lineNo = explicitLineNo || (lineNum.toUpperCase().startsWith(prefix) ? lineNum.toUpperCase() : `${prefix}${lineNum}`);

    const entryId = cols[idxEntryId] ? cols[idxEntryId].trim() : `EBH-${cleanDate.replace(/-/g, '').slice(-6)}-${lineNo}-${String(i).padStart(2, '0')}`;
    const timestamp = cols[idxTimestamp] ? cols[idxTimestamp].trim() : `${cleanDate} 17:30:00`;
    const assignedUser = cols[idxUser] ? cols[idxUser].trim() : `${validFactory.toLowerCase()}_op`;

    const smv = cleanNum(cols[idxSmv]) || 15.0;
    const plannedQty = cleanNum(cols[idxPlannedQty]);
    const actualQty = cleanNum(cols[idxActualQty]);
    const rawProdMins = cleanNum(cols[idxProducedMins]);
    const producedMins = rawProdMins > 0 ? rawProdMins : Math.round(actualQty * smv);
    const planTMs = cleanNum(cols[idxPlanTMs]) || 14;
    const actualTMs = cleanNum(cols[idxActualTMs]) || planTMs;
    const presentTMs = cleanNum(cols[idxPresentTMs]) || actualTMs;
    const hoursWorked = cleanNum(cols[idxHoursWorked]) || 9.0;
    
    // Normalization: Ensure Total Line Worked Minutes is mathematically accurate
    // If a record has single-person shift minutes (e.g. 540 min for a 9-hr shift)
    // instead of line capacity (e.g. 68 * 9 * 60 = 36,720 min), normalize it.
    const rawWorkedMins = cleanNum(cols[idxWorkedMins]);
    const expectedLineMins = Math.round(presentTMs * hoursWorked * 60);
    let workedMins = rawWorkedMins;
    if (!workedMins || workedMins <= 0) {
      workedMins = expectedLineMins;
    } else if (presentTMs > 1 && hoursWorked > 0) {
      const singleWorkerMins = hoursWorked * 60;
      if (workedMins <= singleWorkerMins * 1.5 || workedMins < expectedLineMins * 0.25) {
        workedMins = expectedLineMins;
      }
    }
    
    // Calculate down time: Total Worked Minutes - (Actual Output Qty * SMV)
    const rawDownTime = cols[idxDownTime] !== undefined ? cleanNum(cols[idxDownTime]) : 0;
    const calculatedDownTime = Math.max(0, Math.round(workedMins - (actualQty * smv)));
    const downTime = rawDownTime > 0 && rawDownTime <= workedMins ? rawDownTime : calculatedDownTime;

    logs.push({
      Entry_ID: entryId,
      Timestamp: timestamp,
      Date: cleanDate,
      Factory: validFactory,
      Line: lineNum,
      Line_No: lineNo,
      Supervisor: cols[idxSupervisor] ? cols[idxSupervisor].trim().toUpperCase() : 'SUPERVISOR',
      Style: (cols[idxStyle] || 'STYLE').replace(/\n/g, ' ').trim().toUpperCase(),
      Product: cols[idxProduct] ? cols[idxProduct].trim().toUpperCase() : 'SHIRT',
      Brand: cols[idxBrand] ? cols[idxBrand].trim() : 'VANTAGE',
      SMV: smv,
      Planned_QTY: plannedQty,
      Actual_QTY: actualQty,
      Produced_Minutes: producedMins,
      Plan_TMs: planTMs,
      Actual_TMs: actualTMs,
      Present_TMs: presentTMs,
      Hours_Worked: hoursWorked,
      Worked_Minutes: workedMins,
      Down_Time: downTime,
      Remarks: cols[idxRemarks] ? cols[idxRemarks].trim() : 'Standard production run',
      User: assignedUser
    });
  }

  return logs;
}
