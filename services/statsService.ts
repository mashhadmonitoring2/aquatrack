
/**
 * Statistical services for Hydrological Analysis
 */

// Mann-Kendall Trend Test
export const calculateMannKendall = (data: number[]) => {
  let s = 0;
  const n = data.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      if (data[j] > data[i]) s += 1;
      if (data[j] < data[i]) s -= 1;
    }
  }
  if (s > 0) return 'صعودی (Increasing)';
  if (s < 0) return 'نزولی (Decreasing)';
  return 'بدون روند (Stable)';
};

// Pettitt's Test for Change Point Detection
export const findPettittChangePoint = (data: number[], dates: string[]) => {
  const n = data.length;
  if (n < 4) return null;
  
  let maxU = 0;
  let changePointIdx = -1;

  for (let t = 1; t < n; t++) {
    let u = 0;
    for (let i = 0; i < t; i++) {
      for (let j = t; j < n; j++) {
        const diff = data[i] - data[j];
        u += diff > 0 ? 1 : diff < 0 ? -1 : 0;
      }
    }
    if (Math.abs(u) > maxU) {
      maxU = Math.abs(u);
      changePointIdx = t;
    }
  }
  return changePointIdx !== -1 ? dates[changePointIdx] : null;
};

// Shewhart Control Limits (Mean +/- 3*Sigma)
export const calculateControlLimits = (data: number[]) => {
  const n = data.length;
  if (n === 0) return { mean: 0, ucl: 0, lcl: 0 };
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const stdDev = Math.sqrt(data.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / n);
  return {
    mean,
    ucl: mean + 3 * stdDev,
    lcl: Math.max(0, mean - 3 * stdDev)
  };
};

// EWMA (Exponentially Weighted Moving Average)
export const calculateEWMA = (data: number[], lambda: number = 0.3) => {
  if (data.length === 0) return [];
  const ewma = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ewma.push(lambda * data[i] + (1 - lambda) * ewma[i - 1]);
  }
  return ewma;
};
