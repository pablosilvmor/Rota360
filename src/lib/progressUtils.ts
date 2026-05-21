export interface InspectionItem {
  id: string;
  name: string;
  periodicityKM: number;
  unit?: string;
}

export interface InspectionRecord {
  id: string;
  itemId: string;
  conformity: 'SIM' | 'NÃO' | 'NA' | '';
  serviceExecuted: 'SIM' | 'NÃO' | 'NaKM' | '';
  lastMaintenanceKM: number;
  nextMaintenanceKM: number;
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
}

export const isTimeBasedUnit = (unit?: string) => {
  if (!unit) return false;
  const u = unit.toLowerCase();
  return ['dias', 'diário', 'meses', 'mensal', 'anos', 'anual'].includes(u);
};

export const calculateDaysDiff = (dateStr1: string, dateStr2: string) => {
  const d1 = new Date(dateStr1 + 'T12:00:00');
  const d2 = new Date(dateStr2 + 'T12:00:00');
  const diffTime = d1.getTime() - d2.getTime();
  return diffTime / (1000 * 3600 * 24);
};

export const calculateNextDate = (lastDateStr: string, unit: string, periodicity: number) => {
  if (!lastDateStr) return '';
  const dateObj = new Date(lastDateStr + 'T12:00:00');
  const u = unit.toLowerCase();
  
  if (u === 'dias' || u === 'diário') {
    dateObj.setDate(dateObj.getDate() + periodicity);
  } else if (u === 'meses' || u === 'mensal') {
    dateObj.setMonth(dateObj.getMonth() + periodicity);
  } else if (u === 'anos' || u === 'anual') {
    dateObj.setFullYear(dateObj.getFullYear() + periodicity);
  }
  
  return dateObj.toISOString().split('T')[0];
};

export const calculateProgress = (item: InspectionItem, record: InspectionRecord, currentVehicleKM: number) => {
  const isTimeBased = isTimeBasedUnit(item.unit);
  let progressPercent = 0;
  let remainingNumber = 0;
  let isOutdated = false;
  let descRemaining = '';
  
  if (isTimeBased) {
    if (record.lastMaintenanceDate && record.nextMaintenanceDate) {
      const today = new Date().toISOString().split('T')[0];
      const totalDays = calculateDaysDiff(record.nextMaintenanceDate, record.lastMaintenanceDate) || 1;
      const daysPassed = calculateDaysDiff(today, record.lastMaintenanceDate);
      remainingNumber = Math.max(0, calculateDaysDiff(record.nextMaintenanceDate, today));
      const daysOverdue = calculateDaysDiff(today, record.nextMaintenanceDate);
      
      if (daysOverdue > 0) {
        progressPercent = 100;
        isOutdated = true;
        remainingNumber = daysOverdue; 
        descRemaining = `VENCIDO HÁ ${Math.round(daysOverdue)} DIAS`;
      } else {
        progressPercent = Math.min(100, Math.max(0, (daysPassed / totalDays) * 100));
        descRemaining = `RESTAM ${Math.round(remainingNumber)} DIAS`;
      }
    }
  } else {
    const kmSinceLast = currentVehicleKM - (record.lastMaintenanceKM || 0);
    if (item.periodicityKM > 0) {
       progressPercent = Math.min(100, Math.max(0, (kmSinceLast / item.periodicityKM) * 100));
    }
    remainingNumber = (record.nextMaintenanceKM || 0) - currentVehicleKM;
    if (progressPercent >= 100) {
      isOutdated = true;
      descRemaining = `VENCIDO HÁ ${Math.abs(remainingNumber).toLocaleString('pt-BR')} ${item.unit?.toUpperCase() || 'KM'}`;
    } else {
      descRemaining = `RESTAM ${remainingNumber.toLocaleString('pt-BR')} ${item.unit?.toUpperCase() || 'KM'}`;
    }
  }

  return { progressPercent, remainingNumber, isOutdated, descRemaining };
};
