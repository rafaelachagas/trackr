"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { getDashboardData, fetchActiveProducts } from '@/app/actions/dashboard';

type FilterPeriod = "Hoje" | "Ontem" | "Últimos 7 dias" | "Últimos 30 dias" | "Este Mês" | "Mês Passado" | "Personalizado";

interface DashboardMetrics {
  revenue: number;
  spend: number;
  roas: number;
  salesCount: number;
  frontCount: number;
  upsellCount: number;
  imposto: number;
}

interface DashboardContextType {
  period: FilterPeriod;
  setPeriod: (period: FilterPeriod) => void;
  product: string;
  setProduct: (product: string) => void;
  productsList: string[];
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  setDateRange: (range: { start: Date | null; end: Date | null }) => void;
  metrics: DashboardMetrics;
  chartData: any[];
  refreshData: () => void;
  sincronizarTudo: () => Promise<void>;
  lastUpdate: Date;
  isRefreshing: boolean;
  firstLoadDone: boolean;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  isPrivate: boolean;
  setIsPrivate: (isPrivate: boolean) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [period, setPeriod] = useState<FilterPeriod>("Hoje");
  const [product, setProduct] = useState("Qualquer");
  const [productsList, setProductsList] = useState<string[]>(["Qualquer"]);
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: startOfDay(new Date()),
    end: endOfDay(new Date()),
  });
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    revenue: 0,
    spend: 0,
    roas: 0,
    salesCount: 0,
    frontCount: 0,
    upsellCount: 0,
    imposto: 0,
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Só vira true depois do 1º ciclo completo (sync da Meta + refresh) — evita
  // mostrar os cards com "Gastos R$0" antes do gasto de hoje sincronizar.
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [isPrivate, setIsPrivate] = useState(false);

  // Theme & Privacy management
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const savedPrivate = localStorage.getItem('isPrivate') === 'true';
    
    if (savedTheme) setTheme(savedTheme);
    setIsPrivate(savedPrivate);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('isPrivate', String(isPrivate));
  }, [isPrivate]);

  // Update date range based on period
  useEffect(() => {
    const now = new Date();
    let start = null;
    let end = endOfDay(now);

    switch (period) {
      case "Hoje":
        start = startOfDay(now);
        break;
      case "Ontem":
        start = startOfDay(subDays(now, 1));
        end = endOfDay(subDays(now, 1));
        break;
      case "Últimos 7 dias":
        start = startOfDay(subDays(now, 7));
        break;
      case "Últimos 30 dias":
        start = startOfDay(subDays(now, 30));
        break;
      case "Este Mês":
        start = startOfMonth(now);
        break;
      case "Mês Passado":
        start = startOfMonth(subMonths(now, 1));
        end = endOfMonth(subMonths(now, 1));
        break;
      case "Personalizado":
        // Keep current range or set to null to force selection
        return;
      default:
        start = startOfDay(subDays(now, 7));
    }

    if (start) {
      setDateRange({ start, end });
    }
  }, [period]);

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      const startDateStr = dateRange.start ? dateRange.start.toISOString() : '';
      const endDateStr = dateRange.end ? dateRange.end.toISOString() : '';
      
      const result = await getDashboardData(product, startDateStr, endDateStr);

      if (!result.success) throw new Error(result.error);

      if (result.metrics) {
        const vendas = result.vendas ?? []
        const frontCount = vendas.filter((v: any) => v.tipo === 'front').length
        const upsellCount = vendas.filter((v: any) => v.tipo === 'upsell').length
        setMetrics({ ...result.metrics, frontCount, upsellCount });
      }

      // Process chart data (simple example grouping by day)
      const days: any = {};
      result.vendas?.forEach((v: any) => {
        const d = format(new Date(v.data), 'dd/MM');
        if (!days[d]) days[d] = { name: d, receita: 0, gasto: 0 };
        days[d].receita += Number(v.valor_liquido ?? v.valor);
      });
      result.gastos?.forEach((g: any) => {
        // g.data é DATE puro ('yyyy-MM-dd'); new Date() interpretaria como UTC
        // e jogaria o gasto no dia anterior no fuso local. Fatia a string direto.
        const d = `${String(g.data).slice(8, 10)}/${String(g.data).slice(5, 7)}`;
        if (!days[d]) days[d] = { name: d, receita: 0, gasto: 0 };
        days[d].gasto += Number(g.valor_gasto);
      });

      setChartData(Object.values(days));
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Error refreshing dashboard data:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const sincronizarTudo = async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        fetch('/api/meta/sync', { method: 'POST' }),
        fetch('/api/hotmart/sync', { method: 'POST' }),
        fetch('/api/vturb/sync'),
      ]);
      await refreshData();
    } catch (error) {
      console.error('Erro ao sincronizar:', error);
    } finally {
      setIsRefreshing(false);
      setFirstLoadDone(true);
    }
  };

  const fetchProductsList = async () => {
    try {
      const result = await fetchActiveProducts();
      if (!result.success) throw new Error(result.error);
      
      if (result.data) {
        setProductsList(["Qualquer", ...result.data]);
      }
    } catch (error) {
      console.error("Error fetching products list:", error);
    }
  };

  // Initial load
  useEffect(() => {
    fetchProductsList();
    refreshData();
  }, [period, product, dateRange]);

  // Auto-sync on mount and every 5 minutes
  useEffect(() => {
    sincronizarTudo();
    const interval = setInterval(sincronizarTudo, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <DashboardContext.Provider
      value={{
        period,
        setPeriod,
        product,
        setProduct,
        productsList,
        dateRange,
        setDateRange,
        metrics,
        chartData,
        refreshData,
        sincronizarTudo,
        lastUpdate,
        isRefreshing,
        firstLoadDone,
        theme,
        setTheme,
        isPrivate,
        setIsPrivate,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
}
