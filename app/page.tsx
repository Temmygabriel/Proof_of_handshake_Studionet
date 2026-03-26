"use client";
import { useState, useCallback } from "react";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";       
import { TransactionStatus } from "genlayer-js/types";


const CONTRACT_ADDRESS = "0x2B7e6204ca1aaA86990a73f2739a2f36a3a60451";

type Screen =
  | "home"
  | "role_select"
  | "create"
  | "my_claim"
  | "respond_claim"
  | "status"
  | "verdict"
  | "appeal"
  | "appeal_pending"
  | "final_verdict";

type CaseStatus =
  | "idle"
  | "waiting_other"
  | "ready_verdict"
  | "round1_complete"
  | "appeal_filed"
  | "final";

type Role = "host" | "guest" | null;

const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "KES", "GHS", "ZAR", "AED"];

interface CaseState {
  case_id: number;
  host_name: string;
  guest_name: string;
  property_address: string;
  deposit_amount: string;
  agreement_terms: string;
  host_claim: string;
  host_evidence: string;
  guest_claim: string;
  guest_evidence: string;
  status: string;
  round: number;
  round1_winner: string;
  round1_verdict: string;
  round1_reasoning: string;
  appeal_party: string;
  appeal_reason: string;
  winner: string;
  verdict: string;
  reasoning: string;
  appeal_outcome: string;
  appeal_address: string;
  is_final: boolean;
}

function makeClient() {
  const account = createAccount();
  const client = createClient({ chain: studionet, account });
  return { client, account };
}

async function writeContract(fn: string, args: (string | number | boolean | bigint)[]): Promise<boolean> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { client } = makeClient();
      console.log(`writeContract attempt ${attempt}/${MAX_ATTEMPTS}: ${fn}`);
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: fn,
        args,
        leaderOnly: false,
      } as any);
      await client.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.ACCEPTED,
        retries: 100,
        interval: 4000,
      });
      return true;
    } catch (err: any) {
      console.error(`writeContract ${fn} attempt ${attempt} failed:`, err?.message);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, attempt * 4000));
        continue;
      }
      return false;
    }
  }
  return false;
}

async function readCase(caseId: number): Promise<CaseState | null> {
  try {
    const { client } = makeClient();
    const result = await client.readContract({
      address: CONTRACT_ADDRESS as any,
      functionName: "get_case",
      args: [caseId],
    });
    const raw = result as string;
    if (!raw) return null;
    return JSON.parse(raw) as CaseState;
  } catch { return null; }
}

async function readCaseCount(): Promise<number> {
  try {
    const { client } = makeClient();
    const result = await client.readContract({
      address: CONTRACT_ADDRESS as any,
      functionName: "get_case_count",
      args: [],
    });
    return Number(result);
  } catch { return 0; }
}

function getCaseStatus(state: CaseState): CaseStatus {
  if (state.status === "final") return "final";
  if (state.status === "appeal_filed") return "appeal_filed";
  if (state.status === "round1_complete") return "round1_complete";
  const hostFiled = !!(state.host_claim?.length);
  const guestFiled = !!(state.guest_claim?.length);
  if (hostFiled && guestFiled) return "ready_verdict";
  return "waiting_other";
}

function resolveWinner(cs: CaseState): "guest" | "host" {
  const w = cs.winner?.toLowerCase() || "";
  if (w === "host") return "host";
  return "guest";
}

function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <circle cx="28" cy="28" r="27" stroke="#c0392b" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d="M14 30 Q14 24 19 22 L22 21 Q24 20.5 24 23 L24 28" stroke="#f5f0e8" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M24 23 L24 19 Q24 17 26 17 Q28 17 28 19 L28 26" stroke="#f5f0e8" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M28 20 L28 17 Q28 15.5 30 15.5 Q32 15.5 32 17 L32 25" stroke="#f5f0e8" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M32 22 L32 19 Q32 17.5 34 17.5 Q36 17.5 36 19 L36 27" stroke="#f5f0e8" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M14 30 Q14 36 18 38 L24 40 Q28 41 32 40 L36 38 Q40 36 40 30 L40 27 Q36 27 32 25 L28 23 Q24 23 24 28 Q20 28 14 30 Z" fill="#c0392b" fillOpacity="0.2" />
      <path d="M14 30 Q14 36 18 38 L24 40 Q28 41 32 40 L36 38 Q40 36 40 30 L40 27 Q36 27 32 25 L28 23 Q24 23 24 28 Q20 28 14 30 Z" stroke="#c0392b" strokeWidth="1.5" fill="none" />
      <circle cx="28" cy="34" r="4" fill="#c0392b" />
      <text x="28" y="36.5" textAnchor="middle" fontSize="5" fill="#f5f0e8" fontWeight="bold">✓</text>
    </svg>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [myRole, setMyRole] = useState<Role>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [caseId, setCaseId] = useState<number | null>(null);
  const [caseData, setCaseData] = useState<CaseState | null>(null);
  const [caseStatus, setCaseStatus] = useState<CaseStatus>("idle");
  const [statusChecking, setStatusChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<"not_yet" | "ready" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [verdictCopied, setVerdictCopied] = useState(false);

  // Create form
  const [propertyAddress, setPropertyAddress] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [hostName, setHostName] = useState("");
  const [guestName, setGuestName] = useState("");
  const [agreementTerms, setAgreementTerms] = useState("");

  // Claim form
  const [myClaim, setMyClaim] = useState("");
  const [myEvidence, setMyEvidence] = useState("");

  // Appeal form
  const [appealReason, setAppealReason] = useState("");

  const [loadId, setLoadId] = useState("");

  const reset = useCallback(() => {
    setScreen("home"); setMyRole(null); setCaseId(null); setCaseData(null);
    setCaseStatus("idle"); setStatusChecking(false); setCheckResult(null);
    setError(""); setCopied(false); setVerdictCopied(false);
    setPropertyAddress(""); setDepositAmount(""); setCurrency("NGN");
    setHostName(""); setGuestName(""); setAgreementTerms("");
    setMyClaim(""); setMyEvidence(""); setAppealReason(""); setLoadId("");
  }, []);

  const checkStatus = useCallback(async (id: number, navigate = true) => {
    setStatusChecking(true);
    const state = await readCase(id);
    if (!state) {
      setStatusChecking(false);
      setError("Could not read case. Check the ID and try again.");
      return;
    }
    setCaseData(state);
    const cs = getCaseStatus(state);
    setCaseStatus(cs);
    setStatusChecking(false);

    if (cs === "final") {
      setScreen("final_verdict");
    } else if (cs === "round1_complete") {
      setScreen("verdict");
    } else if (cs === "appeal_filed") {
      setScreen("appeal_pending");
    } else if (cs === "ready_verdict") {
      setCheckResult("ready");
      if (navigate) setScreen("status");
    } else {
      setCheckResult("not_yet");
      if (navigate) setScreen("status");
    }
  }, []);

  // ── HANDLERS ──

  const handleCreateCase = async () => {
    if (!propertyAddress || !depositAmount || !hostName || !guestName || !agreementTerms) {
      setError("Please fill in all fields"); return;
    }
    setError(""); setLoading(true); setLoadingMsg("Creating case on the blockchain...");
    const countBefore = await readCaseCount();
    const ok = await writeContract("create_case", [
      hostName, guestName, propertyAddress, `${depositAmount} ${currency}`, agreementTerms
    ]);
    if (!ok) { setError("Transaction failed. Please try again."); setLoading(false); return; }
    setCaseId(countBefore + 1);
    setLoading(false);
    setScreen("my_claim");
  };

  const handleMyClaim = async () => {
    if (!myClaim || !myEvidence) { setError("Please fill in both fields"); return; }
    if (!caseId) return;
    setError(""); setLoading(true); setLoadingMsg("Sealing your claim onchain...");
    const fn = myRole === "host" ? "submit_host_claim" : "submit_guest_claim";
    const ok = await writeContract(fn, [caseId, myClaim, myEvidence]);
    if (!ok) { setError("Transaction failed. Please try again."); setLoading(false); return; }
    setLoading(false);
    await checkStatus(caseId);
  };

  const handleLoadToRespond = async () => {
    if (!myRole) { setError("Please select your role first"); return; }
    const id = parseInt(loadId);
    if (isNaN(id) || id < 1) { setError("Please enter a valid case ID"); return; }
    setError(""); setLoading(true); setLoadingMsg("Loading case...");
    const state = await readCase(id);
    setLoading(false);
    if (!state) { setError("Case not found. Check the ID and try again."); return; }
    setCaseId(id); setCaseData(state);
    if (state.status === "final") { setScreen("final_verdict"); return; }
    if (state.status === "round1_complete") { setScreen("verdict"); return; }
    if (state.status === "appeal_filed") { setScreen("appeal_pending"); return; }
    const myClaimFiled = myRole === "host" ? !!(state.host_claim?.length) : !!(state.guest_claim?.length);
    if (myClaimFiled) {
      setCaseStatus(getCaseStatus(state));
      setScreen("status");
    } else {
      setScreen("respond_claim");
    }
  };

  const handleRespondClaim = async () => {
    if (!myClaim || !myEvidence) { setError("Please fill in both fields"); return; }
    if (!caseId) return;
    setError(""); setLoading(true); setLoadingMsg("Sealing your response onchain...");
    const fn = myRole === "host" ? "submit_host_claim" : "submit_guest_claim";
    const ok = await writeContract(fn, [caseId, myClaim, myEvidence]);
    if (!ok) { setError("Transaction failed. Please try again."); setLoading(false); return; }
    setLoading(false);
    await checkStatus(caseId);
  };

  const handleHomeLoad = async () => {
    const id = parseInt(loadId);
    if (isNaN(id) || id < 1) { setError("Please enter a valid case ID"); return; }
    setError(""); setLoading(true); setLoadingMsg("Loading case...");
    setCaseId(id);
    setLoading(false);
    await checkStatus(id);
  };

  const handleRequestVerdict = async () => {
    if (!caseId) return;
    setLoading(true);
    setLoadingMsg("5 AI validators are reading both sides... this takes 30–60 seconds");
    const ok = await writeContract("request_verdict", [caseId]);
    if (!ok) { setError("Transaction failed. Please try again."); setLoading(false); return; }
    setLoadingMsg("Reading verdict from chain...");
    const state = await readCase(caseId);
    setCaseData(state); setLoading(false);
    setScreen("verdict");
  };

  const handleAcceptVerdict = async () => {
    if (!caseId) return;
    setLoading(true); setLoadingMsg("Sealing verdict as final...");
    const ok = await writeContract("accept_verdict", [caseId]);
    if (!ok) { setError("Transaction failed. Please try again."); setLoading(false); return; }
    const state = await readCase(caseId);
    setCaseData(state); setLoading(false);
    setScreen("final_verdict");
  };

  const handleFileAppeal = async () => {
    if (!appealReason.trim()) { setError("Please enter your reason for appeal"); return; }
    if (!caseId || !myRole) return;
    setError(""); setLoading(true); setLoadingMsg("Filing your appeal onchain...");
    const ok = await writeContract("file_appeal", [caseId, myRole, appealReason]);
    if (!ok) { setError("Transaction failed. Please try again."); setLoading(false); return; }
    const state = await readCase(caseId);
    setCaseData(state); setLoading(false);
    setScreen("appeal_pending");
  };

  const handleResolveAppeal = async () => {
    if (!caseId) return;
    setLoading(true);
    setLoadingMsg("Appellate panel reviewing previous verdict... this takes 30–60 seconds");
    const ok = await writeContract("resolve_appeal", [caseId]);
    if (!ok) { setError("Transaction failed. Please try again."); setLoading(false); return; }
    setLoadingMsg("Reading final verdict from chain...");
    const state = await readCase(caseId);
    setCaseData(state); setLoading(false);
    setScreen("final_verdict");
  };

  const copyCaseId = () => {
    if (caseId) { navigator.clipboard.writeText(String(caseId)); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const copyVerdictLink = () => {
    const winner = caseData ? resolveWinner(caseData) : "guest";
    const txt = `Proof of Handshake — Case #${caseId}\nVerdict: ${winner === "guest" ? "GUEST WINS" : "HOST WINS"}\nRuling: ${caseData?.verdict}\nCase ID: ${caseId}\nSite: ${typeof window !== "undefined" ? window.location.origin : ""}`;
    navigator.clipboard.writeText(txt);
    setVerdictCopied(true); setTimeout(() => setVerdictCopied(false), 2500);
  };

  const myLabel = myRole === "host" ? "Host" : "Guest";
  const otherLabel = myRole === "host" ? "Guest" : "Host";
  const myTagClass = myRole === "host" ? "poh-host-tag" : "poh-guest-tag";
  const myIcon = myRole === "host" ? "🏠" : "👤";
  const knownRole = !!myRole;

  return (
    <main className="poh-main">
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { margin: 0; padding: 0; overflow-x: hidden; background: var(--ink1); color: var(--text1); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        :root {
          --ink1: #0d0d0e; --ink2: #17181a; --ink3: #202123; --ink4: #2a2b2f;
          --text1: #f5f0e8; --text2: #d1c9b8; --muted1: #a5a09a; --muted2: #7a7670;
          --red1: #c0392b; --red2: #e74c3c; --gold1: #d4a843; --gold2: #f1c057;
          --green1: #27ae60; --green2: #2ecc71;
          --r: 16px;
        }
        @media (prefers-color-scheme: light) {
          :root {
            --ink1: #fafafa; --ink2: #f2f2f2; --ink3: #e5e5e5; --ink4: #d4d4d4;
            --text1: #1a1a1a; --text2: #404040; --muted1: #666666; --muted2: #8f8f8f;
          }
        }
        .poh-main { min-height: 100vh; display: flex; flex-direction: column; position: relative; }
        .poh-hero { background: linear-gradient(180deg, var(--ink2) 0%, var(--ink1) 100%); padding: 6rem 1.5rem 4rem 1.5rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2rem; text-align: center; border-bottom: 1px solid var(--ink3); }
        .poh-hero-inner { max-width: 540px; width: 100%; display: flex; flex-direction: column; align-items: center; gap: 1.5rem; }
        .poh-hero-logo { display: flex; align-items: center; gap: 0.75rem; }
        .poh-logo-text { font-size: 1.4rem; font-weight: 800; color: var(--text1); letter-spacing: -0.03em; }
        .poh-tagline { font-size: 0.85rem; color: var(--muted1); line-height: 1.65; letter-spacing: 0.03em; text-transform: uppercase; }
        .poh-hero-title { font-size: 2.5rem; font-weight: 800; line-height: 1.15; color: var(--text1); letter-spacing: -0.05em; }
        .poh-hero-desc { font-size: 1rem; line-height: 1.65; color: var(--muted1); max-width: 480px; }
        .poh-actions { display: flex; flex-direction: column; gap: 0.75rem; width: 100%; max-width: 320px; }
        .poh-btn { appearance: none; border: none; border-radius: var(--r); font-size: 0.9rem; font-weight: 600; padding: 0.85rem 1.5rem; cursor: pointer; transition: all 0.2s cubic-bezier(0.4,0,0.2,1); font-family: inherit; letter-spacing: 0.02em; text-align: center; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; white-space: nowrap; }
        .poh-btn-red { background: var(--red1); color: #fff; }
        .poh-btn-red:hover { background: var(--red2); transform: translateY(-1px); }
        .poh-btn-outline { background: transparent; color: var(--text2); border: 1px solid var(--ink4); }
        .poh-btn-outline:hover { background: var(--ink2); border-color: var(--muted2); }
        .poh-btn-gold { background: var(--gold1); color: var(--ink1); }
        .poh-btn-gold:hover { background: var(--gold2); transform: translateY(-1px); }
        .poh-btn-green { background: var(--green1); color: #fff; }
        .poh-btn-green:hover { background: var(--green2); transform: translateY(-1px); }
        .poh-btn-ghost { background: transparent; color: var(--muted1); }
        .poh-btn-ghost:hover { background: var(--ink2); color: var(--text2); }
        .poh-btn-full { width: 100%; }
        .poh-btn-gavel { box-shadow: 0 0 24px rgba(212,168,67,0.25); }
        .poh-divider { margin: 1.5rem 0; height: 1px; background: var(--ink3); }
        .poh-load-case-wrap { display: flex; align-items: center; gap: 0.75rem; }
        .poh-load-case-input { flex: 1; background: var(--ink2); border: 1px solid var(--ink3); border-radius: var(--r); padding: 0.75rem 1rem; font-size: 0.9rem; color: var(--text1); font-family: inherit; }
        .poh-load-case-input::placeholder { color: var(--muted2); }
        .poh-load-case-input:focus { outline: none; border-color: var(--red1); }
        .poh-form-wrap { flex: 1; padding: 3rem 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 2rem; }
        .poh-form-hdr { max-width: 540px; width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 0.75rem; }
        .poh-step-tag { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted1); background: var(--ink2); border: 1px solid var(--ink3); border-radius: 999px; padding: 0.3rem 0.85rem; display: inline-flex; }
        .poh-form-title { font-size: 1.75rem; font-weight: 800; line-height: 1.2; letter-spacing: -0.03em; color: var(--text1); }
        .poh-form-sub { font-size: 0.9rem; color: var(--muted1); line-height: 1.65; }
        .poh-card { background: var(--ink2); border: 1px solid var(--ink3); border-radius: var(--r); padding: 2rem; max-width: 540px; width: 100%; display: flex; flex-direction: column; gap: 1.5rem; }
        .poh-field { display: flex; flex-direction: column; gap: 0.5rem; }
        .poh-field label { font-size: 0.82rem; font-weight: 600; color: var(--text2); }
        .poh-input { background: var(--ink1); border: 1px solid var(--ink3); border-radius: 12px; padding: 0.75rem 1rem; font-size: 0.9rem; color: var(--text1); font-family: inherit; }
        .poh-input::placeholder { color: var(--muted2); }
        .poh-input:focus { outline: none; border-color: var(--red1); }
        .poh-textarea { background: var(--ink1); border: 1px solid var(--ink3); border-radius: 12px; padding: 0.75rem 1rem; font-size: 0.9rem; color: var(--text1); font-family: inherit; resize: vertical; line-height: 1.65; }
        .poh-textarea::placeholder { color: var(--muted2); }
        .poh-textarea:focus { outline: none; border-color: var(--red1); }
        .poh-select { background: var(--ink1); border: 1px solid var(--ink3); border-radius: 12px; padding: 0.75rem 1rem; font-size: 0.9rem; color: var(--text1); font-family: inherit; cursor: pointer; }
        .poh-select:focus { outline: none; border-color: var(--red1); }
        .poh-error { font-size: 0.82rem; color: var(--red2); line-height: 1.65; }
        .poh-success { font-size: 0.82rem; color: var(--green2); line-height: 1.65; }
        .poh-id-display { background: var(--ink1); border: 1px solid var(--ink3); border-radius: var(--r); padding: 1rem; font-family: monospace; font-size: 1rem; color: var(--text1); display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
        .poh-id-number { font-size: 1.25rem; font-weight: 700; color: var(--red1); }
        .poh-copy-btn { appearance: none; border: none; background: var(--ink3); color: var(--text2); border-radius: 8px; padding: 0.5rem 1rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.2s; }
        .poh-copy-btn:hover { background: var(--ink4); }
        .poh-party-tag { font-size: 0.85rem; font-weight: 700; padding: 0.6rem 1.25rem; border-radius: 999px; display: inline-flex; align-items: center; gap: 0.5rem; }
        .poh-host-tag { background: rgba(192,57,43,0.1); color: var(--red2); border: 1px solid rgba(192,57,43,0.3); }
        .poh-guest-tag { background: rgba(39,174,96,0.1); color: var(--green2); border: 1px solid rgba(39,174,96,0.3); }
        .poh-role-select-wrap { display: flex; gap: 1rem; width: 100%; }
        .poh-role-card { flex: 1; background: var(--ink2); border: 2px solid var(--ink3); border-radius: var(--r); padding: 1.5rem; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; text-align: center; }
        .poh-role-card:hover { border-color: var(--red1); }
        .poh-role-icon { font-size: 2rem; }
        .poh-role-label { font-size: 1rem; font-weight: 700; color: var(--text1); }
        .poh-role-desc { font-size: 0.8rem; color: var(--muted1); line-height: 1.65; }
        .poh-status-screen { flex: 1; padding: 3rem 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 2rem; }
        .poh-status-card { background: var(--ink2); border: 1px solid var(--ink3); border-radius: var(--r); padding: 2rem; max-width: 540px; width: 100%; display: flex; flex-direction: column; gap: 1.5rem; align-items: center; text-align: center; }
        .poh-status-icon { font-size: 3rem; }
        .poh-status-title { font-size: 1.5rem; font-weight: 800; color: var(--text1); }
        .poh-status-desc { font-size: 0.9rem; color: var(--muted1); line-height: 1.65; }
        .poh-verdict-screen { flex: 1; padding: 3rem 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 2rem; }
        .poh-verdict-banner { background: linear-gradient(135deg, var(--ink2) 0%, var(--ink1) 100%); border: 1px solid var(--ink3); border-radius: var(--r); padding: 3rem 2rem; max-width: 740px; width: 100%; display: flex; flex-direction: column; align-items: center; gap: 1.5rem; text-align: center; position: relative; overflow: hidden; }
        .poh-verdict-banner::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, var(--red1), var(--gold1), var(--red1)); }
        .poh-final-badge { font-size: 0.7rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold1); background: rgba(212,168,67,0.1); border: 1px solid rgba(212,168,67,0.25); border-radius: 999px; padding: 0.4rem 1rem; }
        .poh-verdict-seal { margin: 1rem 0; }
        .poh-verdict-winner { font-size: 2rem; font-weight: 900; letter-spacing: -0.03em; }
        .poh-guest-wins .poh-verdict-winner { color: var(--green1); }
        .poh-host-wins .poh-verdict-winner { color: var(--red1); }
        .poh-verdict-deposit { font-size: 1rem; color: var(--muted1); }
        .poh-verdict-cards { max-width: 740px; width: 100%; display: flex; flex-direction: column; gap: 1.5rem; }
        .poh-vcard { background: var(--ink2); border: 1px solid var(--ink3); border-radius: var(--r); padding: 1.5rem; }
        .poh-vcard h3 { font-size: 1rem; font-weight: 700; color: var(--text1); margin-bottom: 0.75rem; }
        .poh-vcard p { font-size: 0.9rem; color: var(--muted1); line-height: 1.65; }
        .poh-verdict-quote-sm { font-style: italic; color: var(--text2); }
        .poh-details-grid { display: grid; grid-template-columns: auto 1fr; gap: 0.75rem 1.5rem; font-size: 0.85rem; }
        .poh-dl { color: var(--muted1); }
        .poh-dv { color: var(--text2); font-weight: 600; }
        .poh-id-badge { font-family: monospace; color: var(--red1); font-weight: 700; }
        .poh-resolved { color: var(--green1); font-weight: 700; }
        .poh-consensus-card { background: linear-gradient(135deg, rgba(212,168,67,0.04), rgba(192,57,43,0.04)); border-color: rgba(212,168,67,0.15); }
        .poh-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .poh-chip { font-size: 0.7rem; font-weight: 600; background: var(--ink3); color: var(--muted1); border-radius: 999px; padding: 0.35rem 0.75rem; }
        .poh-chip-agree { font-size: 0.7rem; font-weight: 600; background: rgba(39,174,96,0.1); color: var(--green1); border: 1px solid rgba(39,174,96,0.2); border-radius: 999px; padding: 0.35rem 0.75rem; }
        .poh-contract-ref { margin-top: 1rem; font-size: 0.75rem; color: var(--muted2); font-family: monospace; }
        .poh-mono { font-family: monospace; color: var(--text2); }
        .poh-share-verdict-card { background: rgba(212,168,67,0.04); border-color: rgba(212,168,67,0.15); }
        .poh-prev-verdict-box { background: rgba(192,57,43,0.06); border: 1px solid rgba(192,57,43,0.2); border-radius: var(--r); padding: 1rem; }
        .poh-prev-verdict-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted1); margin-bottom: 0.5rem; }
        .poh-prev-winner { font-size: 0.9rem; font-weight: 700; color: var(--red2); margin-bottom: 0.5rem; }
        .poh-prev-ruling { font-size: 0.82rem; font-style: italic; color: var(--text2); line-height: 1.65; margin-bottom: 0.5rem; }
        .poh-prev-reasoning { font-size: 0.75rem; color: var(--muted1); line-height: 1.65; }
        .poh-appeal-pending-box { background: rgba(212,168,67,0.06); border: 1px solid rgba(212,168,67,0.2); border-radius: var(--r); padding: 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; text-align: center; }
        .poh-appeal-pending-icon { font-size: 2.5rem; }
        .poh-appeal-pending-title { font-size: 1.1rem; font-weight: 700; color: var(--gold1); }
        .poh-appeal-pending-sub { font-size: 0.85rem; color: var(--muted1); line-height: 1.65; }
        .poh-appeal-party-tag { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--gold1); background: rgba(212,168,67,0.1); border: 1px solid rgba(212,168,67,0.25); border-radius: 999px; padding: 0.35rem 0.85rem; }
        .poh-appeal-reason-preview { font-size: 0.82rem; font-style: italic; color: var(--text2); line-height: 1.65; margin-top: 0.5rem; }
        .poh-validators-block { background: var(--ink1); border: 1px solid var(--ink3); border-radius: var(--r); padding: 1rem; }
        .poh-validators-label { font-size: 0.82rem; font-weight: 600; color: var(--text2); margin-bottom: 0.75rem; }
        .poh-pending-note { font-size: 0.75rem; color: var(--muted2); line-height: 1.65; margin-top: 0.75rem; }
        .poh-appeal-outcome-card { border-width: 2px; }
        .poh-overturned { background: rgba(212,168,67,0.06); border-color: rgba(212,168,67,0.3); }
        .poh-upheld { background: rgba(39,174,96,0.06); border-color: rgba(39,174,96,0.3); }
        .poh-outcome-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted1); margin-bottom: 0.5rem; }
        .poh-outcome-result-overturned { font-size: 1rem; font-weight: 800; color: var(--gold1); margin-bottom: 0.75rem; }
        .poh-outcome-result-upheld { font-size: 1rem; font-weight: 800; color: var(--green1); margin-bottom: 0.75rem; }
        .poh-outcome-address { font-size: 0.82rem; color: var(--text2); line-height: 1.65; }
        .poh-loading-overlay { position: fixed; inset: 0; background: rgba(13,13,14,0.9); display: flex; align-items: center; justify-content: center; z-index: 9999; }
        .poh-spinner-wrap { display: flex; flex-direction: column; align-items: center; gap: 1.5rem; text-align: center; max-width: 320px; padding: 2rem; }
        .poh-spinner { width: 48px; height: 48px; border: 4px solid var(--ink3); border-top-color: var(--red1); border-radius: 50%; animation: poh-spin 0.8s linear infinite; }
        @keyframes poh-spin { to { transform: rotate(360deg); } }
        .poh-loading-msg { font-size: 0.9rem; color: var(--muted1); line-height: 1.65; }
        .poh-footer { background: var(--ink2); border-top: 1px solid var(--ink3); padding: 1.5rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; }
        .poh-footer-logo { display: flex; align-items: center; gap: 0.5rem; }
        .poh-footer-name { font-size: 0.85rem; font-weight: 700; color: var(--text2); }
        .poh-footer-right { font-size: 0.75rem; color: var(--muted2); }
        .poh-appeal-actions { display: flex; flex-direction: column; gap: 0.75rem; }
        .poh-appeal-note { font-size: 0.85rem; color: var(--muted1); line-height: 1.65; text-align: center; }
        .poh-appeal-divider { display: flex; align-items: center; gap: 1rem; margin: 0.5rem 0; }
        .poh-appeal-divider::before, .poh-appeal-divider::after { content: ""; flex: 1; height: 1px; background: var(--ink3); }
        .poh-appeal-divider span { font-size: 0.75rem; color: var(--muted2); text-transform: uppercase; letter-spacing: 0.05em; }
        @media (max-width: 640px) {
          .poh-hero { padding: 4rem 1rem 3rem 1rem; }
          .poh-hero-title { font-size: 2rem; }
          .poh-form-wrap { padding: 2rem 1rem; }
          .poh-card { padding: 1.5rem; }
          .poh-verdict-banner { padding: 2rem 1.5rem; }
          .poh-verdict-winner { font-size: 1.5rem; }
          .poh-role-select-wrap { flex-direction: column; }
        }
        @media print {
          .poh-hero, .poh-footer, .poh-btn, .poh-loading-overlay { display: none !important; }
          .poh-verdict-screen { padding: 1rem; }
        }
      `}</style>

      {loading && (
        <div className="poh-loading-overlay">
          <div className="poh-spinner-wrap">
            <div className="poh-spinner" />
            <p className="poh-loading-msg">{loadingMsg}</p>
          </div>
        </div>
      )}

      <div style={{flex:1}}>
        {/* ── HOME ── */}
        {screen === "home" && (
          <>
            <div className="poh-hero">
              <div className="poh-hero-inner">
                <div className="poh-hero-logo">
                  <Logo size={48} />
                  <div className="poh-logo-text">Proof of Handshake</div>
                </div>
                <div className="poh-tagline">Onchain Justice · Powered by AI Consensus</div>
                <h1 className="poh-hero-title">Rent Disputes Resolved in 60 Seconds</h1>
                <p className="poh-hero-desc">
                  Transparent, binding arbitration powered by 5 independent AI validators on GenLayer Studio. No lawyers. No waiting. Just results locked onchain forever.
                </p>
                <div className="poh-actions">
                  <button className="poh-btn poh-btn-red poh-btn-full" onClick={()=>setScreen("role_select")}>
                    File a New Dispute →
                  </button>
                  <div className="poh-divider" />
                  <div className="poh-load-case-wrap">
                    <input
                      className="poh-load-case-input"
                      placeholder="Enter Case ID"
                      value={loadId}
                      onChange={e=>setLoadId(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&handleHomeLoad()}
                    />
                    <button className="poh-btn poh-btn-outline" onClick={handleHomeLoad}>Load</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── ROLE SELECT ── */}
        {screen === "role_select" && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Step 1 of 4 · Role</div>
              <h2 className="poh-form-title">Select Your Role</h2>
              <p className="poh-form-sub">Are you the property host or the guest filing this dispute?</p>
            </div>
            <div className="poh-card">
              <div className="poh-role-select-wrap">
                <div className="poh-role-card" onClick={()=>{setMyRole("host"); loadId ? handleLoadToRespond() : setScreen("create");}}>
                  <div className="poh-role-icon">🏠</div>
                  <div className="poh-role-label">Host</div>
                  <p className="poh-role-desc">I own or manage the property</p>
                </div>
                <div className="poh-role-card" onClick={()=>{setMyRole("guest"); loadId ? handleLoadToRespond() : setScreen("create");}}>
                  <div className="poh-role-icon">👤</div>
                  <div className="poh-role-label">Guest</div>
                  <p className="poh-role-desc">I rented or leased the property</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── CREATE CASE ── */}
        {screen === "create" && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Step 2 of 4 · Case Details</div>
              <h2 className="poh-form-title">Create Your Case</h2>
              <p className="poh-form-sub">Fill in the details of your rent dispute. This will be locked onchain and shared with both parties.</p>
            </div>
            <div className="poh-card">
              <div className={`poh-party-tag ${myTagClass}`}>{myIcon} Filing as {myLabel}</div>
              <div className="poh-field">
                <label>Property Address</label>
                <input className="poh-input" placeholder="e.g. 123 Main St, Apt 4B, Lagos" value={propertyAddress} onChange={e=>setPropertyAddress(e.target.value)} />
              </div>
              <div className="poh-field">
                <label>Security Deposit / Caution Fee Amount</label>
                <div style={{display:"flex",gap:"0.5rem"}}>
                  <input className="poh-input" style={{flex:1}} type="number" placeholder="e.g. 500000" value={depositAmount} onChange={e=>setDepositAmount(e.target.value)} />
                  <select className="poh-select" value={currency} onChange={e=>setCurrency(e.target.value)} style={{minWidth:"100px"}}>
                    {CURRENCIES.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="poh-field">
                <label>Host Name</label>
                <input className="poh-input" placeholder="Full name or company name" value={hostName} onChange={e=>setHostName(e.target.value)} />
              </div>
              <div className="poh-field">
                <label>Guest Name</label>
                <input className="poh-input" placeholder="Full name" value={guestName} onChange={e=>setGuestName(e.target.value)} />
              </div>
              <div className="poh-field">
                <label>Agreement Terms (Optional)</label>
                <textarea className="poh-textarea" placeholder="Briefly describe the rental agreement or any relevant terms both parties agreed to" value={agreementTerms} onChange={e=>setAgreementTerms(e.target.value)} rows={3} />
              </div>
              {error && <p className="poh-error">{error}</p>}
              <button className="poh-btn poh-btn-red poh-btn-full" onClick={handleCreateCase}>Create Case & Continue →</button>
            </div>
          </div>
        )}

        {/* ── MY CLAIM (after creating case) ── */}
        {screen === "my_claim" && caseId && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Step 3 of 4 · Your Claim · Case #{caseId}</div>
              <h2 className="poh-form-title">Submit Your Claim</h2>
              <p className="poh-form-sub">State your side clearly. This will be locked onchain and shared with the other party and the AI validators.</p>
            </div>
            <div className="poh-card">
              <div className="poh-id-display">
                <div><span style={{fontSize:"0.75rem",color:"var(--muted1)",textTransform:"uppercase"}}>Case ID</span><br/><span className="poh-id-number">#{caseId}</span></div>
                <button className="poh-copy-btn" onClick={copyCaseId}>{copied?"✓ Copied":"📋 Copy ID"}</button>
              </div>
              <p style={{fontSize:"0.82rem",color:"var(--muted1)",lineHeight:"1.65"}}>Share this ID with the other party so they can load and respond to your claim.</p>
              <div className={`poh-party-tag ${myTagClass}`}>{myIcon} Filing as {myLabel}</div>
              <div className="poh-field">
                <label>Your Claim</label>
                <textarea className="poh-textarea" placeholder="What happened? What do you want as a resolution?" value={myClaim} onChange={e=>setMyClaim(e.target.value)} rows={4} />
              </div>
              <div className="poh-field">
                <label>Evidence (Optional)</label>
                <textarea className="poh-textarea" placeholder="Links to photos, receipts, messages, or any other documentation" value={myEvidence} onChange={e=>setMyEvidence(e.target.value)} rows={3} />
              </div>
              {error && <p className="poh-error">{error}</p>}
              <button className="poh-btn poh-btn-red poh-btn-full" onClick={handleMyClaim}>Seal Claim Onchain →</button>
            </div>
          </div>
        )}

        {/* ── RESPOND CLAIM (loading existing case) ── */}
        {screen === "respond_claim" && caseId && caseData && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Case #{caseId} · Respond to Claim</div>
              <h2 className="poh-form-title">Respond to the {otherLabel}'s Claim</h2>
              <p className="poh-form-sub">You are responding as the <strong>{myLabel}</strong>. State your side clearly.</p>
            </div>
            <div className="poh-card">
              <div style={{background:"var(--ink1)",border:"1px solid var(--ink3)",borderRadius:"var(--r)",padding:"1rem"}}>
                <div style={{fontSize:"0.75rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",color:"var(--muted1)",marginBottom:"0.5rem"}}>Case Details</div>
                <div className="poh-details-grid">
                  <span className="poh-dl">Property</span><span className="poh-dv">{caseData.property_address}</span>
                  <span className="poh-dl">Caution Fee</span><span className="poh-dv">{caseData.deposit_amount}</span>
                  <span className="poh-dl">Host</span><span className="poh-dv">{caseData.host_name}</span>
                  <span className="poh-dl">Guest</span><span className="poh-dv">{caseData.guest_name}</span>
                </div>
              </div>
              <div style={{background:"rgba(192,57,43,0.06)",border:"1px solid rgba(192,57,43,0.2)",borderRadius:"var(--r)",padding:"1rem"}}>
                <div style={{fontSize:"0.75rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",color:"var(--muted1)",marginBottom:"0.5rem"}}>{otherLabel}'s Claim</div>
                <p style={{fontSize:"0.85rem",color:"var(--text2)",lineHeight:"1.65",marginBottom:"0.75rem"}}>{myRole==="host"?caseData.guest_claim:caseData.host_claim}</p>
                {(myRole==="host"?caseData.guest_evidence:caseData.host_evidence) && (
                  <>
                    <div style={{fontSize:"0.7rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em",color:"var(--muted1)",marginBottom:"0.25rem"}}>Evidence</div>
                    <p style={{fontSize:"0.75rem",color:"var(--muted2)",lineHeight:"1.65"}}>{myRole==="host"?caseData.guest_evidence:caseData.host_evidence}</p>
                  </>
                )}
              </div>
              <div className={`poh-party-tag ${myTagClass}`}>{myIcon} Responding as {myLabel}</div>
              <div className="poh-field">
                <label>Your Claim</label>
                <textarea className="poh-textarea" placeholder="Your response to the dispute. What is your side of the story?" value={myClaim} onChange={e=>setMyClaim(e.target.value)} rows={4} />
              </div>
              <div className="poh-field">
                <label>Evidence (Optional)</label>
                <textarea className="poh-textarea" placeholder="Links to photos, receipts, messages, or any other documentation" value={myEvidence} onChange={e=>setMyEvidence(e.target.value)} rows={3} />
              </div>
              {error && <p className="poh-error">{error}</p>}
              <button className="poh-btn poh-btn-red poh-btn-full" onClick={handleRespondClaim}>Seal Response Onchain →</button>
            </div>
          </div>
        )}

        {/* ── STATUS CHECK ── */}
        {screen === "status" && caseId && (
          <div className="poh-status-screen">
            {statusChecking ? (
              <div className="poh-status-card">
                <div className="poh-spinner" />
                <p className="poh-status-title">Checking case status...</p>
              </div>
            ) : checkResult === "not_yet" ? (
              <div className="poh-status-card">
                <div className="poh-status-icon">⏳</div>
                <div className="poh-status-title">Waiting for the other party</div>
                <p className="poh-status-desc">You've filed your claim. The {otherLabel} needs to respond before we can summon the validators. Share Case ID <strong className="poh-id-badge">#{caseId}</strong> with them.</p>
                <button className="poh-btn poh-btn-outline" onClick={()=>checkStatus(caseId)}>🔄 Check Status Again</button>
                <button className="poh-btn poh-btn-ghost" onClick={reset}>← Back to Home</button>
              </div>
            ) : (
              <div className="poh-status-card">
                <div className="poh-status-icon">✅</div>
                <div className="poh-status-title">Both sides are in!</div>
                <p className="poh-status-desc">All claims are sealed onchain. You can now summon the 5 AI validators to reach a verdict.</p>
                <button className="poh-btn poh-btn-gold poh-btn-full poh-btn-gavel" onClick={handleRequestVerdict}>⚖️ Summon the Validators — Get Verdict</button>
              </div>
            )}
          </div>
        )}

        {/* ── VERDICT ── */}
        {screen === "verdict" && caseData && (() => {
          const winner = resolveWinner(caseData);
          return (
            <div className="poh-verdict-screen">
              <div className={`poh-verdict-banner ${winner === "guest" ? "poh-guest-wins" : "poh-host-wins"}`}>
                <div className="poh-final-badge">Round 1 Verdict · Appeals Possible</div>
                <div className="poh-verdict-seal"><Logo size={52} /></div>
                <div className="poh-verdict-winner">{winner === "guest" ? "Guest Wins" : "Host Wins"}</div>
                <div className="poh-verdict-deposit">{caseData.verdict}</div>
              </div>

              <div className="poh-verdict-cards">
                <div className="poh-vcard"><h3>📋 Round 1 Ruling</h3><p>{caseData.verdict || "No ruling text recorded."}</p></div>
                <div className="poh-vcard"><h3>🧠 AI Reasoning</h3><p className="poh-verdict-quote-sm">&ldquo;{caseData.reasoning || "No reasoning recorded."}&rdquo;</p></div>
                <div className="poh-vcard">
                  <h3>📁 Case Details</h3>
                  <div className="poh-details-grid">
                    <span className="poh-dl">Property</span><span className="poh-dv">{caseData.property_address}</span>
                    <span className="poh-dl">Caution Fee</span><span className="poh-dv">{caseData.deposit_amount}</span>
                    <span className="poh-dl">Host</span><span className="poh-dv">{caseData.host_name}</span>
                    <span className="poh-dl">Guest</span><span className="poh-dv">{caseData.guest_name}</span>
                    <span className="poh-dl">Case ID</span><span className="poh-dv poh-id-badge">#{caseData.case_id}</span>
                    <span className="poh-dl">Round</span><span className="poh-dv">1 of 2</span>
                  </div>
                </div>
                <div className="poh-vcard poh-consensus-card">
                  <h3>🔗 Onchain Consensus</h3>
                  <p>This verdict was reached by 5 independent AI validators on GenLayer Studio — transparent, auditable, and tamper-proof.</p>
                  <div className="poh-chips" style={{marginTop:"1rem"}}>
                    {["GPT-5.1 ✓","Grok-4 ✓","Qwen3-235b ✓","Claude Sonnet ✓","Majority Agree ✓"].map(c=><span key={c} className="poh-chip-agree">{c}</span>)}
                  </div>
                  <div className="poh-contract-ref">Contract: <span className="poh-mono">{CONTRACT_ADDRESS.slice(0,10)}...{CONTRACT_ADDRESS.slice(-6)}</span></div>
                </div>

                {/* APPEALS DECISION */}
                <div className="poh-vcard" style={{background:"rgba(212,168,67,0.04)", border:"1px solid rgba(212,168,67,0.2)"}}>
                  <h3 style={{color:"var(--gold2)"}}>🔁 This Is Not Final Yet</h3>
                  <p style={{marginBottom:"1.25rem"}}>The losing party may appeal or accept this verdict. If appealed, a fresh panel of 5 validators reviews the full case and must explicitly address why they uphold or overturn this ruling. After Round 2, the verdict is locked forever.</p>
                  <div className="poh-appeal-actions">
                    {/* No role selected — prompt them to identify first */}
                    {!myRole && (
                      <>
                        <p className="poh-appeal-note">To take action on this verdict, reload this case with your role selected.</p>
                        <button className="poh-btn-outline poh-btn-full" onClick={() => { setLoadId(String(caseData.case_id)); setScreen("role_select"); }}>
                          Select My Role →
                        </button>
                      </>
                    )}

                    {/* Role selected — winner sees waiting UI, loser sees action buttons */}
                    {myRole && (() => {
                      const iWon = resolveWinner(caseData) === myRole;
                      if (iWon) {
                        return (
                          <div style={{
                            background: "rgba(39,174,96,0.06)",
                            border: "1px solid rgba(39,174,96,0.2)",
                            borderRadius: "var(--r)",
                            padding: "1.25rem",
                            display: "flex",
                            flexDirection: "column" as const,
                            gap: "0.75rem",
                            alignItems: "center",
                            textAlign: "center" as const,
                          }}>
                            <div style={{fontSize:"2rem"}}>🏆</div>
                            <div style={{fontSize:"1rem", fontWeight:700, color:"var(--green2)"}}>
                              You won this round
                            </div>
                            <div style={{fontSize:"0.82rem", color:"var(--muted2)", lineHeight:1.65, maxWidth:"320px"}}>
                              The {myRole === "host" ? "guest" : "host"} can accept this verdict or file an appeal within their own session. You'll be notified of the outcome when they act — or check back using Case ID <strong style={{color:"var(--text2)"}}>#{caseData.case_id}</strong>.
                            </div>
                            <div style={{
                              display:"flex", alignItems:"center", gap:"8px",
                              background:"rgba(255,255,255,0.04)", border:"1px solid var(--ink4)",
                              borderRadius:"999px", padding:"0.3rem 1rem",
                              fontSize:"0.75rem", color:"var(--muted1)", fontFamily:"monospace"
                            }}>
                              <span style={{width:7, height:7, borderRadius:"50%", background:"var(--gold2)", display:"inline-block", flexShrink:0}} />
                              Awaiting {myRole === "host" ? "guest" : "host"} response
                            </div>
                          </div>
                        );
                      } else {
                        return (
                          <>
                            <div style={{
                              background:"rgba(192,57,43,0.06)", border:"1px solid rgba(192,57,43,0.2)",
                              borderRadius:"var(--r)", padding:"0.75rem 1rem",
                              fontSize:"0.82rem", color:"#f5a0a0", lineHeight:1.65
                            }}>
                              ⚠️ You lost Round 1. You may appeal or accept the verdict below. This is your only appeal — after Round 2 the result is locked permanently.
                            </div>
                            <button className="poh-btn-red poh-btn-full" onClick={() => setScreen("appeal")}>
                              🔁 I Disagree — File an Appeal (Round 2)
                            </button>
                            <div className="poh-appeal-divider"><span>or</span></div>
                            <button className="poh-btn-green poh-btn-full" onClick={handleAcceptVerdict}>
                              ✓ I Accept This Verdict — Lock It Final
                            </button>
                          </>
                        );
                      }
                    })()}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── APPEAL SCREEN ── */}
        {screen === "appeal" && caseData && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Round 2 · Appeal · Case #{caseId}</div>
              <h2 className="poh-form-title">File Your Appeal</h2>
              <p className="poh-form-sub">You are appealing as the <strong>{myLabel}</strong>. A new panel of 5 validators will re-read the full case and must explicitly address the Round 1 reasoning.</p>
            </div>
            <div className="poh-card">
              <div className="poh-prev-verdict-box">
                <div className="poh-prev-verdict-label">Round 1 Verdict You Are Appealing</div>
                <div className="poh-prev-winner">{resolveWinner(caseData) === "guest" ? "👤 Guest Won Round 1" : "🏠 Host Won Round 1"}</div>
                <p className="poh-prev-ruling">&ldquo;{caseData.round1_verdict}&rdquo;</p>
                <p className="poh-prev-reasoning">{caseData.round1_reasoning}</p>
              </div>
              <div className={`poh-party-tag ${myTagClass}`}>{myIcon} Filing Appeal as {myLabel}</div>
              <div className="poh-field">
                <label>Grounds for Appeal</label>
                <textarea className="poh-textarea"
                  placeholder="Explain why the Round 1 verdict was wrong. What did the judges miss? What evidence was not properly considered? Be specific — the appellate panel will directly respond to this."
                  value={appealReason} onChange={e=>setAppealReason(e.target.value)} rows={5} />
              </div>
              {error && <p className="poh-error">{error}</p>}
              <div style={{background:"rgba(212,168,67,0.06)", border:"1px solid rgba(212,168,67,0.2)", borderRadius:"var(--r)", padding:"0.75rem 1rem", fontSize:"0.8rem", color:"var(--gold2)", lineHeight:"1.65"}}>
                ⚠️ This is your only appeal. After Round 2, no further appeals are possible and the verdict is locked permanently onchain.
              </div>
              <button className="poh-btn-gold poh-btn-full" onClick={handleFileAppeal}>Submit Appeal →</button>
            </div>
          </div>
        )}

        {/* ── APPEAL PENDING ── */}
        {screen === "appeal_pending" && caseData && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Case #{caseId} · Appeal Filed</div>
              <h2 className="poh-form-title">Appeal is Onchain 📜</h2>
              <p className="poh-form-sub">The appeal has been sealed. Either party can now summon the appellate panel.</p>
            </div>
            <div className="poh-card">
              <div className="poh-appeal-pending-box">
                <div className="poh-appeal-pending-icon">⚖️</div>
                <div className="poh-appeal-pending-title">Appeal Filed by {caseData.appeal_party === "host" ? "Host 🏠" : "Guest 👤"}</div>
                <div className="poh-appeal-pending-sub">The appellate panel will re-read the full case including Round 1 reasoning and the appeal grounds. They must explicitly state whether they uphold or overturn the original verdict.</div>
                <div className="poh-appeal-party-tag">Grounds: Appeal Filed</div>
                <p className="poh-appeal-reason-preview">&ldquo;{caseData.appeal_reason}&rdquo;</p>
              </div>
              <div className="poh-prev-verdict-box">
                <div className="poh-prev-verdict-label">Round 1 Verdict Under Review</div>
                <div className="poh-prev-winner">{caseData.round1_winner === "guest" ? "👤 Guest Won Round 1" : "🏠 Host Won Round 1"}</div>
                <p className="poh-prev-ruling" style={{marginBottom:0}}>&ldquo;{caseData.round1_verdict}&rdquo;</p>
              </div>
              <div className="poh-validators-block">
                <p className="poh-validators-label">Fresh appellate panel — 5 validators:</p>
                <div className="poh-chips">
                  {["GPT-5.1","Grok-4","Qwen3-235b","Claude Sonnet","+ more"].map(c=><span key={c} className="poh-chip">{c}</span>)}
                </div>
                <p className="poh-pending-note">Each validator receives the original claims, evidence, Round 1 verdict, and the appeal reason. They must directly address the appeal. This is the final round — no more appeals after this.</p>
              </div>
              {error && <p className="poh-error">{error}</p>}
              <button className="poh-btn-gold poh-btn-full poh-btn-gavel" onClick={handleResolveAppeal}>
                ⚖️ Summon Appellate Panel — Final Round
              </button>
            </div>
          </div>
        )}

        {/* ── FINAL VERDICT ── */}
        {screen === "final_verdict" && caseData && (() => {
          const winner = resolveWinner(caseData);
          const wasAppealed = !!(caseData.appeal_outcome);
          const wasOverturned = caseData.appeal_outcome === "overturned";
          return (
            <div className="poh-verdict-screen">
              <div className={`poh-verdict-banner ${winner === "guest" ? "poh-guest-wins" : "poh-host-wins"}`}>
                <div className="poh-final-badge">🔒 FINAL · Locked Onchain · No More Appeals</div>
                <div className="poh-verdict-seal"><Logo size={52} /></div>
                <div className="poh-verdict-winner">{winner === "guest" ? "Guest Wins" : "Host Wins"}</div>
                <div className="poh-verdict-deposit">{caseData.verdict}</div>
              </div>

              <div className="poh-verdict-cards">
                <div className="poh-vcard"><h3>📋 Final Ruling</h3><p>{caseData.verdict || "No ruling text recorded."}</p></div>
                <div className="poh-vcard"><h3>🧠 Final Reasoning</h3><p className="poh-verdict-quote-sm">&ldquo;{caseData.reasoning || "No reasoning recorded."}&rdquo;</p></div>

                {wasAppealed && (
                  <div className={`poh-vcard poh-appeal-outcome-card ${wasOverturned ? "poh-overturned" : "poh-upheld"}`}>
                    <div className="poh-outcome-label">Appeal Outcome</div>
                    {wasOverturned
                      ? <div className="poh-outcome-result-overturned">🔄 Round 1 Verdict Overturned</div>
                      : <div className="poh-outcome-result-upheld">✅ Round 1 Verdict Upheld</div>
                    }
                    <p className="poh-outcome-address">{caseData.appeal_address}</p>
                  </div>
                )}

                {wasAppealed && (
                  <div className="poh-vcard">
                    <h3>📜 Round 1 Original Verdict</h3>
                    <div className="poh-details-grid" style={{marginBottom:"0.5rem"}}>
                      <span className="poh-dl">Round 1 winner</span>
                      <span className="poh-dv">{caseData.round1_winner === "guest" ? "Guest" : "Host"}</span>
                    </div>
                    <p style={{fontSize:"0.82rem", color:"var(--muted2)", fontStyle:"italic", margin:0}}>&ldquo;{caseData.round1_verdict}&rdquo;</p>
                  </div>
                )}

                <div className="poh-vcard">
                  <h3>📁 Case Details</h3>
                  <div className="poh-details-grid">
                    <span className="poh-dl">Property</span><span className="poh-dv">{caseData.property_address}</span>
                    <span className="poh-dl">Caution Fee</span><span className="poh-dv">{caseData.deposit_amount}</span>
                    <span className="poh-dl">Host</span><span className="poh-dv">{caseData.host_name}</span>
                    <span className="poh-dl">Guest</span><span className="poh-dv">{caseData.guest_name}</span>
                    <span className="poh-dl">Case ID</span><span className="poh-dv poh-id-badge">#{caseData.case_id}</span>
                    <span className="poh-dl">Rounds</span><span className="poh-dv">{wasAppealed ? "2 (with appeal)" : "1 (accepted)"}</span>
                    <span className="poh-dl">Status</span><span className="poh-dv poh-resolved">🔒 Final · Locked Onchain</span>
                  </div>
                </div>

                <div className="poh-vcard poh-consensus-card">
                  <h3>🔗 Onchain Consensus</h3>
                  <p>This final verdict was reached by {wasAppealed ? "two independent panels of" : ""} 5 AI validators on GenLayer Studio — transparent, auditable, and tamper-proof. This verdict cannot be changed.</p>
                  <div className="poh-chips" style={{marginTop:"1rem"}}>
                    {["GPT-5.1 ✓","Grok-4 ✓","Qwen3-235b ✓","Claude Sonnet ✓","Majority Agree ✓"].map(c=><span key={c} className="poh-chip-agree">{c}</span>)}
                  </div>
                  <div className="poh-contract-ref">Contract: <span className="poh-mono">{CONTRACT_ADDRESS.slice(0,10)}...{CONTRACT_ADDRESS.slice(-6)}</span></div>
                </div>

                <div className="poh-vcard poh-share-verdict-card">
                  <h3>📤 Share This Verdict</h3>
                  <p style={{fontSize:"0.82rem", color:"var(--muted2)", marginBottom:"1rem"}}>Both parties can view this final result using Case ID <strong className="poh-id-badge">#{caseData.case_id}</strong>.</p>
                  <div style={{display:"flex", gap:"0.75rem", flexWrap:"wrap"}}>
                    <button className="poh-btn-outline" onClick={copyVerdictLink}>{verdictCopied ? "✓ Copied!" : "📋 Copy verdict summary"}</button>
                    <button className="poh-btn-ghost" onClick={() => window.print()}>🖨️ Print / Save as PDF</button>
                  </div>
                </div>
              </div>
              <button className="poh-btn-red" onClick={reset}>File Another Dispute →</button>
            </div>
          );
        })()}

      </div>

      <footer className="poh-footer">
        <div className="poh-footer-logo"><Logo size={18} /><span className="poh-footer-name">Proof of Handshake</span></div>
        <p className="poh-footer-right">Built on GenLayer · Onchain Justice Track · Bradbury Builders Hackathon 2026</p>
      </footer>
    </main>
  );
}
