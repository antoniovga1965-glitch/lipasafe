"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { DiasporaDeal, DisputeCase, FloatTransaction, AuditLog, DiasporaActivityLog, ActivityLogsPagination } from "@/types";
import { fetchPendingDeals, fetchDisputesAPI, fetchFloat, fetchActivityLogs, fetchAllDeals } from "@/lib/api";
import { io, Socket } from "socket.io-client";

const POLL_INTERVAL = 15_000;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface DataContextType {
  deals: DiasporaDeal[];
  dealsLoading: boolean;
  disputes: DisputeCase[];
  floatBalance: number;
  floatTransactions: FloatTransaction[];
  logs: AuditLog[];
  updateDeal: (deal: DiasporaDeal) => void;
  updateDispute: (dispute: DisputeCase) => void;
  addFloatTransaction: (tx: FloatTransaction) => void;
  addLog: (log: AuditLog) => void;
  setFloatBalance: (balance: number) => void;
  refetchDeals: () => void;
  activityLogs: DiasporaActivityLog[];
  logsPagination: ActivityLogsPagination;
  logsLoading: boolean;
  loadMoreLogs: () => void;
  allDeals: DiasporaDeal[];
  allDealsLoading: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [deals, setDeals] = useState<DiasporaDeal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [disputes, setDisputes] = useState<DisputeCase[]>([]);
  const [floatBalance, setFloatBalanceState] = useState<number>(0);
  const [floatTransactions, setFloatTransactions] = useState<FloatTransaction[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [activityLogs, setActivityLogs] = useState<DiasporaActivityLog[]>([]);
  const [logsPagination, setLogsPagination] = useState<ActivityLogsPagination>({ page: 0, limit: 20, total: 0, pages: 0 });
  const [logsLoading, setLogsLoading] = useState(true);
  const [allDeals, setAllDeals] = useState<DiasporaDeal[]>([]);
  const [allDealsLoading, setAllDealsLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);

  const loadDeals = useCallback(async () => {
    try {
      const res = await fetchPendingDeals();
      if (res.success) setDeals(res.deals);
    } catch (err) {
      console.error("deals error:", err);
    } finally {
      setDealsLoading(false);
    }
  }, []);

  const loadDisputes = useCallback(async () => {
    try {
      const res = await fetchDisputesAPI();
      if (res.success) { const raw = res.data?.disputes ?? res.disputes ?? []; setDisputes(Array.isArray(raw) ? raw : []); }
    } catch (err) {
      console.error("disputes error:", err);
    }
  }, []);

  const loadFloat = useCallback(async () => {
    try {
      const res = await fetchFloat();
      if (res.success) {
        setFloatBalanceState(parseFloat(res.float?.balance ?? "0"));
        if (res.float?.transactions) setFloatTransactions(res.float.transactions);
      }
    } catch (err) {
      console.error("float error:", err);
    }
  }, []);

  const loadActivityLogs = useCallback(async (page: number = 1, append: boolean = false) => {
    try {
      if (!append) setLogsLoading(true);
      const res = await fetchActivityLogs(page, 20);
      if (res.success) {
        setActivityLogs((prev) => (append ? [...prev, ...res.logs] : res.logs));
        setLogsPagination(res.pagination);
      }
    } catch (err) {
      console.error("activity logs error:", err);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const loadMoreLogs = useCallback(() => {
    if (logsPagination.page < logsPagination.pages && !logsLoading) {
      loadActivityLogs(logsPagination.page + 1, true);
    }
  }, [logsPagination, logsLoading, loadActivityLogs]);

  const loadAllDeals = useCallback(async () => {
    try {
      const res = await fetchAllDeals();
      if (res.success) setAllDeals(res.deals);
    } catch (err) {
      console.error("all deals error:", err);
    } finally {
      setAllDealsLoading(false);
    }
  }, []);

  const loadAll = useCallback(() => {
    if (typeof window === "undefined" || !localStorage.getItem("token")) return;
    loadDeals();
    loadDisputes();
    loadFloat();
    loadAllDeals();
  }, [loadDeals, loadDisputes, loadFloat, loadAllDeals]);

  // Initial load
  useEffect(() => { loadAll(); }, [loadAll]);

  // Activity logs: fetched once on mount, not on the 15s poll cycle — a
  // background poll shouldn't silently reset the secretary's scroll
  // position in the paginated feed after they've clicked "load more".
  useEffect(() => {
    if (typeof window === "undefined" || !localStorage.getItem("token")) return;
    loadActivityLogs(1);
  }, [loadActivityLogs]);

  // Polling every 15s, pause when tab hidden
  useEffect(() => {
    const poll = setInterval(() => { if (!document.hidden) loadAll(); }, POLL_INTERVAL);
    const onVisible = () => { if (!document.hidden) loadAll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", onVisible); };
  }, [loadAll]);

  // Socket.io — real-time push on top of polling
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    const socket = io(API_BASE, {
      auth: { token },
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socket.on("connect", () => console.log("[Socket] connected"));
    socket.on("connect_error", (e) => console.warn("[Socket] error", e.message));
    socket.on("disconnect", () => console.log("[Socket] disconnected"));

    // Push events → refetch relevant slice
    socket.on("deal:updated",   loadDeals);
    socket.on("deal:created",   loadDeals);
    socket.on("deal:confirmed", loadDeals);
    socket.on("deal:rejected",  loadDeals);
    socket.on("dispute:updated", loadDisputes);
    socket.on("dispute:created", loadDisputes);
    socket.on("float:updated",   loadFloat);

    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, [loadDeals, loadDisputes, loadFloat]);

  const updateDeal = useCallback((u: DiasporaDeal) =>
    setDeals((p) => p.map((d) => (d.id === u.id ? u : d))), []);

  const updateDispute = useCallback((u: DisputeCase) =>
    setDisputes((p) => p.map((d) => (d.id === u.id ? u : d))), []);

  const addFloatTransaction = useCallback((tx: FloatTransaction) =>
    setFloatTransactions((p) => [tx, ...p]), []);

  const addLog = useCallback((log: AuditLog) =>
    setLogs((p) => [log, ...p]), []);

  const setFloatBalance = useCallback((b: number) =>
    setFloatBalanceState(b), []);

  return (
    <DataContext.Provider value={{
      deals, dealsLoading, disputes, floatBalance,
      floatTransactions, logs,
      updateDeal, updateDispute, addFloatTransaction,
      addLog, setFloatBalance, refetchDeals: loadDeals,
      activityLogs, logsPagination, logsLoading, loadMoreLogs,
      allDeals, allDealsLoading,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within a DataProvider");
  return ctx;
}
