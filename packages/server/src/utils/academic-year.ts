export interface AcademicYear {
  start: Date;
  end: Date;
  label: string;
}

export function getCurrentAcademicYear(referenceDate: Date = new Date()): AcademicYear {
  const month = referenceDate.getMonth(); // 0-indexed (6 = July)
  const year = referenceDate.getFullYear();

  // If July-December, academic year started this calendar year
  // If January-June, academic year started previous calendar year
  const startYear = month >= 6 ? year : year - 1;
  const endYear = startYear + 1;

  return {
    start: new Date(startYear, 6, 1), // July 1
    end: new Date(endYear, 5, 30), // June 30
    label: `${startYear}-${endYear}`,
  };
}

export function stripTime(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
