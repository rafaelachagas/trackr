"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { subDays, startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";

// Todos os períodos são ancorados no fuso do negócio (São Paulo), NÃO no fuso do
// navegador. Sem isso, um usuário em outro fuso (ex.: Croácia, UTC+2) via um
// "Ontem" deslocado — a janela de vendas cortava horas do dia certo e a de gastos
// chegava a somar DOIS dias, quebrando faturamento/gasto/ROAS pra quem acessa
// de fora do Brasil.
const TZ = "America/Sao_Paulo";
// Recebe as datas-calendário de São Paulo (yyyy-MM-dd) e devolve os instantes
// absolutos das bordas do dia em SP, prontos pra virar ISO/UTC no backend.
function spRange(startStr: string, endStr: string) {
  return {
    start: fromZonedTime(`${startStr}T00:00:00.000`, TZ),
    end: fromZonedTime(`${endStr}T23:59:59.999`, TZ),
  };
}
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
  reembolso: number;
  reembolsoCount: number;
  taxaReembolso: number;
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
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>(() => {
    const hojeSP = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
    return spRange(hojeSP, hojeSP);
  });
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    revenue: 0,
    spend: 0,
    roas: 0,
    salesCount: 0,
    frontCount: 0,
    upsellCount: 0,
    imposto: 0,
    reembolso: 0,
    reembolsoCount: 0,
    taxaReembolso: 0,
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
    // "agora" no fuso de São Paulo (getters locais passam a refletir SP), pra
    // calcular a data-calendário certa independente do fuso do navegador.
    const nowSP = toZonedTime(new Date(), TZ);
    let startStr: string;
    let endStr = format(nowSP, "yyyy-MM-dd");

    switch (period) {
      case "Hoje":
        startStr = format(nowSP, "yyyy-MM-dd");
        break;
      case "Ontem":
        startStr = endStr = format(subDays(nowSP, 1), "yyyy-MM-dd");
        break;
      case "Últimos 7 dias":
        startStr = format(subDays(nowSP, 7), "yyyy-MM-dd");
        break;
      case "Últimos 30 dias":
        startStr = format(subDays(nowSP, 30), "yyyy-MM-dd");
        break;
      case "Este Mês":
        startStr = format(startOfMonth(nowSP), "yyyy-MM-dd");
        break;
      case "Mês Passado":
        startStr = format(startOfMonth(subMonths(nowSP, 1)), "yyyy-MM-dd");
        endStr = format(endOfMonth(subMonths(nowSP, 1)), "yyyy-MM-dd");
        break;
      case "Personalizado":
        // Keep current range or set to null to force selection
        return;
      default:
        startStr = format(subDays(nowSP, 7), "yyyy-MM-dd");
    }

    setDateRange(spRange(startStr, endStr));
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
        // Agrupa pelo dia em São Paulo, não no fuso do navegador — senão a venda
        // cai no balde de dia errado pra quem acessa de outro fuso.
        const d = formatInTimeZone(new Date(v.data), TZ, 'dd/MM');
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
