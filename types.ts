
export interface WaterSample {
  id: string;
  conductivity: number;
  nitrate: number;
  timestamp: string;
  location?: string;
  cluster?: string; 
  clusterColor?: string;
}

export interface TimePoint {
  date: string;
  samples: WaterSample[];
}

export interface StatisticalResult {
  trend: 'Increasing' | 'Decreasing' | 'Stable';
  pWeight: number;
  changePointDate?: string;
  ucl: number;
  lcl: number;
  mean: number;
}

export interface AnalysisResult {
  summary: string;
  anomalies: string[];
  recommendations: string[];
}
