"use client";
import { useState, useCallback } from "react";
import { createClient, createAccount } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";

const studionet = {
  id: 61999,
  name: "GenLayer Studionet",
  rpcUrls: {
    default: { http: ["https://studio.genlayer.com/api"] },
  },
  nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
  testnet: true,
};

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
  try {
    const { client } = makeClient();
    const hash = await client.writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      functionName: fn,
      args,
      value: BigInt(0),
      leaderOnly: false,
    } as any);
    await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
      retries: 60,
      interval: 3000,
    });
    return true;
  } catch (err: any) {
    console.error(`writeContract ${fn} failed:`, err?.message);
    return false;
  }
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

        :root {
          --ink0: #0a0a0a;
          --ink1: #111111;
          --ink2: #1a1a1a;
          --ink3: #242424;
          --ink4: #2e2e2e;
          --ink5: #3a3a3a;
          --muted1: #888;
          --muted2: #aaa;
          --text: #f0ece0;
          --text2: #c8c4b4;
          --red: #c0392b;
          --red2: #e74c3c;
          --gold: #d4a843;
          --gold2: #f0c060;
          --green: #27ae60;
          --green2: #2ecc71;
          --blue: #2980b9;
          --blue2: #3498db;
          --orange: #e67e22;
          --orange2: #f39c12;
          --r: 10px;
          --r2: 16px;
        }

        body { background: var(--ink0); color: var(--text); font-family: 'Georgia', serif; }

        .poh-main { min-height: 100vh; background: var(--ink0); }

        /* NAV */
        .poh-nav { position: sticky; top: 0; z-index: 100; background: rgba(10,10,10,0.92); backdrop-filter: blur(16px); border-bottom: 1px solid var(--ink4); padding: 0 1.5rem; height: 56px; display: flex; align-items: center; }
        .poh-nav-inner { max-width: 860px; margin: 0 auto; width: 100%; display: flex; align-items: center; justify-content: space-between; }
        .poh-logo { display: flex; align-items: center; gap: 10px; cursor: pointer; }
        .poh-logo-name { font-family: 'Georgia', serif; font-size: 1rem; font-weight: 700; color: var(--text); letter-spacing: 0.02em; }
        .poh-nav-right { display: flex; align-items: center; gap: 8px; }

        /* BUTTONS */
        .poh-btn-red { background: var(--red); color: white; border: none; border-radius: var(--r); padding: 0.55rem 1.2rem; font-size: 0.88rem; font-weight: 700; cursor: pointer; transition: all 0.15s; font-family: inherit; }
        .poh-btn-red:hover { background: var(--red2); transform: translateY(-1px); }
        .poh-btn-red:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .poh-btn-outline { background: transparent; color: var(--text2); border: 1px solid var(--ink5); border-radius: var(--r); padding: 0.55rem 1.2rem; font-size: 0.88rem; cursor: pointer; transition: all 0.15s; font-family: inherit; }
        .poh-btn-outline:hover { border-color: var(--muted1); color: var(--text); }
        .poh-btn-ghost { background: transparent; border: none; color: var(--muted1); font-size: 0.85rem; cursor: pointer; padding: 0.4rem 0.6rem; font-family: inherit; transition: color 0.15s; }
        .poh-btn-ghost:hover { color: var(--text); }
        .poh-btn-full { width: 100%; display: block; text-align: center; }
        .poh-btn-gold { background: var(--gold); color: var(--ink0); border: none; border-radius: var(--r); padding: 0.65rem 1.4rem; font-size: 0.9rem; font-weight: 700; cursor: pointer; transition: all 0.15s; font-family: inherit; }
        .poh-btn-gold:hover { background: var(--gold2); transform: translateY(-1px); }
        .poh-btn-green { background: var(--green); color: white; border: none; border-radius: var(--r); padding: 0.65rem 1.4rem; font-size: 0.9rem; font-weight: 700; cursor: pointer; transition: all 0.15s; font-family: inherit; }
        .poh-btn-green:hover { background: var(--green2); transform: translateY(-1px); }

        /* OVERLAY */
        .poh-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 999; display: flex; align-items: center; justify-content: center; }
        .poh-overlay-box { background: var(--ink2); border: 1px solid var(--ink4); border-radius: var(--r2); padding: 2.5rem; text-align: center; max-width: 360px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .poh-seal-spin { animation: spin 3s linear infinite; display: inline-block; margin-bottom: 1.25rem; }
        .poh-overlay-msg { font-size: 1rem; color: var(--text); margin-bottom: 0.5rem; line-height: 1.6; }
        .poh-overlay-sub { font-size: 0.8rem; color: var(--muted1); }

        /* CONTENT */
        .poh-content { max-width: 860px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }

        /* HOME */
        .poh-home {}
        .poh-hero { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center; margin-bottom: 3rem; padding-top: 2rem; }
        @media (max-width: 640px) { .poh-hero { grid-template-columns: 1fr; } .poh-hero-right { display: none; } }
        .poh-stamp { display: inline-flex; align-items: center; gap: 8px; background: var(--ink2); border: 1px solid var(--ink4); border-radius: 999px; padding: 0.3rem 0.9rem; font-size: 0.75rem; color: var(--muted2); margin-bottom: 1.25rem; font-family: monospace; }
        .poh-stamp-dot { width: 6px; height: 6px; background: var(--green2); border-radius: 50%; }
        .poh-h1 { font-family: 'Georgia', serif; font-size: clamp(2rem, 5vw, 3rem); font-weight: 700; line-height: 1.2; color: white; margin-bottom: 1.25rem; }
        .poh-red { color: var(--red2); }
        .poh-hero-p { color: var(--muted2); line-height: 1.75; margin-bottom: 1.75rem; font-size: 0.95rem; }
        .poh-hero-btns { display: flex; gap: 10px; flex-wrap: wrap; }
        .poh-seal-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
        .poh-seal-ring-svg { position: absolute; width: 260px; height: 260px; opacity: 0.6; }
        .poh-seal-center { display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .poh-seal-label { font-size: 0.8rem; color: var(--muted1); font-family: monospace; }
        .poh-seal-status { font-size: 0.72rem; color: var(--green2); font-family: monospace; }

        /* STATS */
        .poh-stats { display: flex; align-items: center; justify-content: space-between; background: var(--ink2); border: 1px solid var(--ink4); border-radius: var(--r2); padding: 1.5rem 2rem; margin-bottom: 2.5rem; flex-wrap: wrap; gap: 1rem; }
        .poh-stat { text-align: center; }
        .poh-stat-num { font-size: 1.6rem; font-weight: 700; color: white; font-family: 'Georgia', serif; }
        .poh-stat-label { font-size: 0.72rem; color: var(--muted1); margin-top: 2px; }
        .poh-stat-div { width: 1px; height: 40px; background: var(--ink5); }

        /* FLOW */
        .poh-flow { margin-bottom: 2.5rem; }
        .poh-section-label { font-size: 0.72rem; color: var(--muted1); text-transform: uppercase; letter-spacing: 0.12em; font-family: monospace; margin-bottom: 1rem; }
        .poh-flow-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
        .poh-flow-step { background: var(--ink2); border: 1px solid var(--ink4); border-radius: var(--r); padding: 1.25rem; }
        .poh-flow-num { font-size: 0.72rem; color: var(--red); font-family: monospace; margin-bottom: 0.5rem; font-weight: 700; }
        .poh-flow-icon { font-size: 1.4rem; margin-bottom: 0.5rem; }
        .poh-flow-title { font-size: 0.88rem; font-weight: 700; color: white; margin-bottom: 0.4rem; }
        .poh-flow-desc { font-size: 0.8rem; color: var(--muted2); line-height: 1.55; }

        /* APPEALS FEATURE BANNER */
        .poh-appeals-banner { background: linear-gradient(135deg, rgba(212,168,67,0.08), rgba(192,57,43,0.08)); border: 1px solid rgba(212,168,67,0.25); border-radius: var(--r2); padding: 1.25rem 1.5rem; margin-bottom: 2.5rem; display: flex; gap: 1rem; align-items: flex-start; }
        .poh-appeals-icon { font-size: 1.5rem; flex-shrink: 0; margin-top: 2px; }
        .poh-appeals-title { font-size: 0.88rem; font-weight: 700; color: var(--gold2); margin-bottom: 0.3rem; }
        .poh-appeals-desc { font-size: 0.82rem; color: var(--muted2); line-height: 1.6; }

        /* SAMPLE */
        .poh-sample { margin-bottom: 2rem; }
        .poh-verdict-box { background: var(--ink2); border: 1px solid var(--ink4); border-radius: var(--r2); overflow: hidden; }
        .poh-verdict-hdr { display: flex; align-items: center; justify-content: space-between; padding: 0.9rem 1.25rem; border-bottom: 1px solid var(--ink4); flex-wrap: wrap; gap: 8px; }
        .poh-verdict-id { font-size: 0.78rem; color: var(--muted1); font-family: monospace; }
        .poh-win-badge { background: rgba(39,174,96,0.12); border: 1px solid rgba(39,174,96,0.3); color: var(--green2); border-radius: 999px; padding: 0.2rem 0.7rem; font-size: 0.72rem; font-weight: 700; font-family: monospace; }
        .poh-verdict-body { padding: 1.25rem; }
        .poh-verdict-quote { font-style: italic; color: var(--text2); line-height: 1.75; font-size: 0.88rem; margin-bottom: 1rem; }

        /* LOAD BOX */
        .poh-load-box { background: var(--ink2); border: 1px solid var(--ink4); border-radius: var(--r2); padding: 1.5rem; }
        .poh-load-label { font-size: 0.82rem; color: var(--muted2); margin-bottom: 0.75rem; }
        .poh-load-row { display: flex; gap: 8px; }

        /* CHIPS */
        .poh-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .poh-chip { background: var(--ink3); border: 1px solid var(--ink5); color: var(--muted2); border-radius: 999px; padding: 0.2rem 0.65rem; font-size: 0.72rem; font-family: monospace; }
        .poh-chip-agree { background: rgba(39,174,96,0.08); border: 1px solid rgba(39,174,96,0.2); color: var(--green2); border-radius: 999px; padding: 0.2rem 0.65rem; font-size: 0.72rem; font-family: monospace; }

        /* FORM WRAP */
        .poh-form-wrap { max-width: 600px; margin: 0 auto; }
        .poh-form-hdr { margin-bottom: 1.5rem; }
        .poh-step-tag { font-size: 0.72rem; color: var(--red); text-transform: uppercase; letter-spacing: 0.1em; font-family: monospace; font-weight: 700; margin-bottom: 0.5rem; }
        .poh-form-title { font-size: 1.75rem; font-weight: 700; color: white; margin-bottom: 0.4rem; line-height: 1.2; }
        .poh-form-sub { color: var(--muted2); font-size: 0.9rem; line-height: 1.6; }
        .poh-id-badge { background: var(--ink3); border: 1px solid var(--ink5); border-radius: 4px; padding: 0.1rem 0.4rem; font-family: monospace; font-size: 0.85em; color: var(--gold2); }

        /* CARD */
        .poh-card { background: var(--ink2); border: 1px solid var(--ink4); border-radius: var(--r2); padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }

        /* FIELDS */
        .poh-field { display: flex; flex-direction: column; gap: 0.4rem; }
        .poh-field label { font-size: 0.8rem; color: var(--muted2); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; font-family: monospace; }
        .poh-input { background: var(--ink1); border: 1px solid var(--ink5); border-radius: var(--r); padding: 0.7rem 0.9rem; color: var(--text); font-size: 0.9rem; font-family: inherit; outline: none; transition: border-color 0.15s; width: 100%; }
        .poh-input:focus { border-color: var(--red); }
        .poh-textarea { background: var(--ink1); border: 1px solid var(--ink5); border-radius: var(--r); padding: 0.7rem 0.9rem; color: var(--text); font-size: 0.88rem; font-family: inherit; outline: none; resize: vertical; transition: border-color 0.15s; width: 100%; line-height: 1.65; }
        .poh-textarea:focus { border-color: var(--red); }
        .poh-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 500px) { .poh-field-row { grid-template-columns: 1fr; } }
        .poh-amount-row { display: flex; gap: 8px; }
        .poh-currency-select { background: var(--ink1); border: 1px solid var(--ink5); border-radius: var(--r); padding: 0.7rem 0.6rem; color: var(--text); font-family: monospace; font-size: 0.88rem; outline: none; flex-shrink: 0; }
        .poh-amount-input { flex: 1; }

        /* PARTY TAGS */
        .poh-party-tag { display: inline-flex; align-items: center; gap: 6px; border-radius: 6px; padding: 0.35rem 0.75rem; font-size: 0.78rem; font-weight: 700; font-family: monospace; margin-bottom: 0.25rem; }
        .poh-host-tag { background: rgba(192,57,43,0.12); border: 1px solid rgba(192,57,43,0.3); color: #f5a0a0; }
        .poh-guest-tag { background: rgba(41,128,185,0.12); border: 1px solid rgba(41,128,185,0.3); color: #90c8f0; }

        /* ERROR */
        .poh-error { color: #f5a0a0; font-size: 0.82rem; background: rgba(192,57,43,0.1); border: 1px solid rgba(192,57,43,0.25); border-radius: 6px; padding: 0.5rem 0.75rem; }

        /* ROLE SELECT */
        .poh-role-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 1.5rem; }
        @media (max-width: 480px) { .poh-role-grid { grid-template-columns: 1fr; } }
        .poh-role-card { background: var(--ink2); border: 2px solid var(--ink4); border-radius: var(--r2); padding: 1.25rem; cursor: pointer; transition: all 0.15s; text-align: left; display: flex; flex-direction: column; gap: 4px; }
        .poh-role-card:hover { border-color: var(--ink5); }
        .poh-role-active-host { border-color: var(--red) !important; background: rgba(192,57,43,0.07) !important; }
        .poh-role-active-guest { border-color: var(--blue2) !important; background: rgba(41,128,185,0.07) !important; }
        .poh-role-icon { font-size: 1.6rem; margin-bottom: 4px; }
        .poh-role-title { font-size: 1rem; font-weight: 700; color: white; }
        .poh-role-desc { font-size: 0.78rem; color: var(--muted2); }
        .poh-role-check { font-size: 0.72rem; color: var(--green2); font-family: monospace; margin-top: 4px; }
        .poh-two-paths { display: flex; flex-direction: column; gap: 0; background: var(--ink2); border: 1px solid var(--ink4); border-radius: var(--r2); overflow: hidden; }
        .poh-path-card { padding: 1.25rem 1.5rem; }
        .poh-path-divider { display: flex; align-items: center; justify-content: center; padding: 0.5rem 0; font-size: 0.75rem; color: var(--muted1); border-top: 1px solid var(--ink4); border-bottom: 1px solid var(--ink4); background: var(--ink1); }
        .poh-path-label { font-size: 0.72rem; color: var(--red); text-transform: uppercase; letter-spacing: 0.1em; font-family: monospace; font-weight: 700; margin-bottom: 0.4rem; }
        .poh-path-desc { font-size: 0.82rem; color: var(--muted2); margin-bottom: 0.75rem; line-height: 1.55; }

        /* STATUS */
        .poh-share-id-block { background: var(--ink1); border: 1px solid var(--ink4); border-radius: var(--r); padding: 1rem; }
        .poh-share-label { font-size: 0.78rem; color: var(--muted2); margin-bottom: 0.5rem; font-family: monospace; }
        .poh-share-id-row { display: flex; align-items: center; gap: 10px; }
        .poh-share-id-num { font-size: 2rem; font-weight: 700; color: white; font-family: 'Georgia', serif; }
        .poh-instructions-block { background: var(--ink3); border-radius: var(--r); padding: 0.9rem 1rem; margin-top: 0.75rem; }
        .poh-instructions-label { font-size: 0.78rem; color: var(--muted2); margin-bottom: 0.5rem; font-family: monospace; }
        .poh-instructions-list { padding-left: 1.2rem; display: flex; flex-direction: column; gap: 4px; }
        .poh-instructions-list li { font-size: 0.82rem; color: var(--text2); line-height: 1.55; }
        .poh-share-note { display: flex; align-items: flex-start; gap: 8px; font-size: 0.8rem; color: var(--muted2); margin-top: 0.5rem; }
        .poh-share-note-icon { flex-shrink: 0; }
        .poh-status-check-block { margin-top: 0.5rem; display: flex; flex-direction: column; gap: 8px; }
        .poh-status-check-label { font-size: 0.78rem; color: var(--muted2); font-family: monospace; }
        .poh-check-result { display: flex; align-items: flex-start; gap: 8px; padding: 0.65rem 0.9rem; border-radius: 8px; font-size: 0.82rem; line-height: 1.55; }
        .poh-check-waiting { background: rgba(212,168,67,0.08); border: 1px solid rgba(212,168,67,0.2); color: var(--gold2); }
        .poh-check-ready { background: rgba(39,174,96,0.08); border: 1px solid rgba(39,174,96,0.2); color: var(--green2); }
        .poh-ready-banner { display: flex; gap: 12px; align-items: flex-start; background: rgba(39,174,96,0.06); border: 1px solid rgba(39,174,96,0.2); border-radius: var(--r); padding: 1rem; }
        .poh-ready-icon { font-size: 1.2rem; flex-shrink: 0; }
        .poh-ready-title { font-size: 0.9rem; font-weight: 700; color: var(--green2); margin-bottom: 0.2rem; }
        .poh-ready-sub { font-size: 0.8rem; color: var(--muted2); }
        .poh-validators-block {}
        .poh-validators-label { font-size: 0.78rem; color: var(--muted2); margin-bottom: 0.5rem; font-family: monospace; }
        .poh-pending-note { font-size: 0.78rem; color: var(--muted1); margin-top: 0.5rem; line-height: 1.55; }
        .poh-btn-gavel { font-size: 1rem; padding: 0.75rem 1.5rem; }

        /* DISPUTE CONTEXT */
        .poh-dispute-context { background: var(--ink1); border: 1px solid var(--ink4); border-radius: var(--r); padding: 1rem; }
        .poh-context-label { font-size: 0.72rem; color: var(--muted1); font-family: monospace; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.75rem; }
        .poh-details-grid { display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 1rem; align-items: start; }
        .poh-dl { font-size: 0.75rem; color: var(--muted1); font-family: monospace; padding-top: 2px; white-space: nowrap; }
        .poh-dv { font-size: 0.85rem; color: var(--text2); line-height: 1.5; }
        .poh-resolved { color: var(--green2); font-family: monospace; font-size: 0.8rem; }

        /* ── VERDICT SCREEN ── */
        .poh-verdict-screen { max-width: 640px; margin: 0 auto; }
        .poh-verdict-banner { border-radius: var(--r2); padding: 2rem; text-align: center; margin-bottom: 1.5rem; position: relative; overflow: hidden; }
        .poh-guest-wins { background: linear-gradient(135deg, rgba(41,128,185,0.15), rgba(41,128,185,0.05)); border: 1px solid rgba(41,128,185,0.3); }
        .poh-host-wins { background: linear-gradient(135deg, rgba(192,57,43,0.15), rgba(192,57,43,0.05)); border: 1px solid rgba(192,57,43,0.3); }
        .poh-verdict-seal { margin-bottom: 1rem; }
        .poh-verdict-winner { font-size: 2rem; font-weight: 700; color: white; margin-bottom: 0.5rem; font-family: 'Georgia', serif; }
        .poh-verdict-deposit { font-size: 0.9rem; color: var(--muted2); line-height: 1.6; max-width: 400px; margin: 0 auto; }
        .poh-verdict-cards { display: flex; flex-direction: column; gap: 12px; margin-bottom: 1.5rem; }
        .poh-vcard { background: var(--ink2); border: 1px solid var(--ink4); border-radius: var(--r2); padding: 1.25rem; }
        .poh-vcard h3 { font-size: 0.88rem; color: var(--muted2); font-family: monospace; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.75rem; font-weight: 600; }
        .poh-vcard p { font-size: 0.9rem; color: var(--text2); line-height: 1.75; margin: 0; }
        .poh-verdict-quote-sm { font-style: italic; }
        .poh-consensus-card {}
        .poh-contract-ref { margin-top: 0.75rem; font-size: 0.72rem; color: var(--muted1); font-family: monospace; }
        .poh-mono { color: var(--gold2); }
        .poh-share-verdict-card {}

        /* ── ROUND 1 VERDICT (appeals enabled) ── */
        .poh-round-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(212,168,67,0.1); border: 1px solid rgba(212,168,67,0.25); border-radius: 999px; padding: 0.25rem 0.75rem; font-size: 0.72rem; color: var(--gold2); font-family: monospace; font-weight: 700; margin-bottom: 1rem; }
        .poh-appeal-actions { display: flex; flex-direction: column; gap: 10px; }
        .poh-appeal-divider { display: flex; align-items: center; gap: 10px; font-size: 0.75rem; color: var(--muted1); }
        .poh-appeal-divider::before, .poh-appeal-divider::after { content: ""; flex: 1; height: 1px; background: var(--ink4); }
        .poh-appeal-note { font-size: 0.78rem; color: var(--muted1); text-align: center; line-height: 1.55; }

        /* ── APPEAL SCREEN ── */
        .poh-prev-verdict-box { background: var(--ink1); border: 1px solid var(--ink4); border-radius: var(--r); padding: 1rem; }
        .poh-prev-verdict-label { font-size: 0.72rem; color: var(--muted1); font-family: monospace; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.5rem; }
        .poh-prev-winner { font-size: 0.88rem; font-weight: 700; color: white; margin-bottom: 0.35rem; }
        .poh-prev-ruling { font-size: 0.82rem; color: var(--text2); line-height: 1.65; margin-bottom: 0.35rem; font-style: italic; }
        .poh-prev-reasoning { font-size: 0.8rem; color: var(--muted2); line-height: 1.65; }

        /* ── APPEAL PENDING ── */
        .poh-appeal-pending-box { background: rgba(212,168,67,0.06); border: 1px solid rgba(212,168,67,0.2); border-radius: var(--r2); padding: 1.5rem; text-align: center; }
        .poh-appeal-pending-icon { font-size: 2rem; margin-bottom: 0.75rem; }
        .poh-appeal-pending-title { font-size: 1.1rem; font-weight: 700; color: var(--gold2); margin-bottom: 0.4rem; }
        .poh-appeal-pending-sub { font-size: 0.85rem; color: var(--muted2); line-height: 1.65; margin-bottom: 1.25rem; }
        .poh-appeal-party-tag { display: inline-block; background: rgba(212,168,67,0.12); border: 1px solid rgba(212,168,67,0.25); color: var(--gold2); border-radius: 999px; padding: 0.2rem 0.7rem; font-size: 0.72rem; font-family: monospace; font-weight: 700; margin-bottom: 0.5rem; }
        .poh-appeal-reason-preview { font-size: 0.82rem; color: var(--text2); font-style: italic; line-height: 1.6; }

        /* ── FINAL VERDICT ── */
        .poh-final-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(192,57,43,0.1); border: 1px solid rgba(192,57,43,0.3); border-radius: 999px; padding: 0.25rem 0.8rem; font-size: 0.72rem; color: var(--red2); font-family: monospace; font-weight: 700; margin-bottom: 1rem; }
        .poh-appeal-outcome-card { border-radius: var(--r2); padding: 1.25rem; }
        .poh-upheld { background: rgba(39,174,96,0.06); border: 1px solid rgba(39,174,96,0.2); }
        .poh-overturned { background: rgba(212,168,67,0.06); border: 1px solid rgba(212,168,67,0.2); }
        .poh-outcome-label { font-size: 0.72rem; color: var(--muted1); font-family: monospace; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.5rem; }
        .poh-outcome-result-upheld { font-size: 0.9rem; font-weight: 700; color: var(--green2); margin-bottom: 0.4rem; }
        .poh-outcome-result-overturned { font-size: 0.9rem; font-weight: 700; color: var(--gold2); margin-bottom: 0.4rem; }
        .poh-outcome-address { font-size: 0.85rem; color: var(--text2); line-height: 1.65; font-style: italic; }

        /* FOOTER */
        .poh-footer { border-top: 1px solid var(--ink4); padding: 1.5rem; margin-top: 2rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; max-width: 860px; margin-left: auto; margin-right: auto; }
        .poh-footer-logo { display: flex; align-items: center; gap: 8px; }
        .poh-footer-name { font-size: 0.82rem; color: var(--muted1); font-family: monospace; }
        .poh-footer-right { font-size: 0.75rem; color: var(--ink5); font-family: monospace; }
      `}</style>

      <nav className="poh-nav">
        <div className="poh-nav-inner">
          <div className="poh-logo" onClick={reset}><Logo size={28} /><span className="poh-logo-name">Proof of Handshake</span></div>
          <div className="poh-nav-right">
            {screen !== "home" && <button className="poh-btn-ghost" onClick={reset}>← Home</button>}
            {screen === "home" && <button className="poh-btn-red" onClick={() => setScreen("role_select")}>File a Dispute →</button>}
          </div>
        </div>
      </nav>

      {loading && (
        <div className="poh-overlay">
          <div className="poh-overlay-box">
            <div className="poh-seal-spin"><Logo size={52} /></div>
            <p className="poh-overlay-msg">{loadingMsg}</p>
            <p className="poh-overlay-sub">Do not close this tab</p>
          </div>
        </div>
      )}

      <div className="poh-content">

        {/* ── HOME ── */}
        {screen === "home" && (
          <div className="poh-home">
            <section className="poh-hero">
              <div className="poh-hero-left">
                <div className="poh-stamp"><span className="poh-stamp-dot" /><span className="poh-stamp-text">Live · GenLayer Studio</span></div>
                <h1 className="poh-h1">Your deposit.<br />Your rights.<br /><span className="poh-red">Proven onchain.</span></h1>
                <p className="poh-hero-p">When your shortlet host refuses to return your caution fee, you deserve more than an argument. You deserve a verdict — transparent, reasoned, and stored permanently on the blockchain. With an appeals layer.</p>
                <div className="poh-hero-btns">
                  <button className="poh-btn-red" onClick={() => setScreen("role_select")}>File a New Dispute →</button>
                  <button className="poh-btn-outline" onClick={() => setScreen("role_select")}>I Have a Case ID</button>
                </div>
              </div>
              <div className="poh-hero-right">
                <div className="poh-seal-wrap">
                  <svg className="poh-seal-ring-svg" viewBox="0 0 260 260">
                    <circle cx="130" cy="130" r="125" fill="none" stroke="#1e1e1e" strokeWidth="1" />
                    <path id="topArc" d="M 20,130 A 110,110 0 0,1 240,130" fill="none" />
                    <path id="botArc" d="M 240,130 A 110,110 0 0,1 20,130" fill="none" />
                    <text fontFamily="monospace" fontSize="9" fill="#2a2a2a" letterSpacing="5"><textPath href="#topArc" startOffset="5%">PROOF · OF · HANDSHAKE · ONCHAIN ARBITRATION ·</textPath></text>
                    <text fontFamily="monospace" fontSize="9" fill="#2a2a2a" letterSpacing="5"><textPath href="#botArc" startOffset="5%">POWERED · BY · GENLAYER · AI CONSENSUS ·</textPath></text>
                  </svg>
                  <div className="poh-seal-center"><Logo size={56} /><span className="poh-seal-label">Verdict sealed</span><span className="poh-seal-status">● Resolved</span></div>
                </div>
              </div>
            </section>

            <div className="poh-appeals-banner">
              <div className="poh-appeals-icon">⚖️</div>
              <div>
                <div className="poh-appeals-title">Now with AI Appeals — A First on Any Blockchain</div>
                <div className="poh-appeals-desc">If you disagree with the Round 1 verdict, file an appeal. A fresh panel of 5 AI validators re-reads the full case — and must explicitly address why they are upholding or overturning the original ruling. After Round 2, the verdict is locked permanently onchain. No more appeals.</div>
              </div>
            </div>

            <div className="poh-stats">
              {[["5","AI Validators"],["2","Max Appeal Rounds"],["~60s","Per Verdict"],["$0","Arbitration Fee"]].map(([n,l],i,a) => (
                <div key={l} style={{display:"flex",alignItems:"center",gap:"2rem"}}>
                  <div className="poh-stat"><div className="poh-stat-num">{n}</div><div className="poh-stat-label">{l}</div></div>
                  {i < a.length-1 && <div className="poh-stat-div" />}
                </div>
              ))}
            </div>

            <div className="poh-flow">
              <div className="poh-section-label">The process</div>
              <div className="poh-flow-grid">
                {[
                  {n:"01",icon:"🎭",title:"Choose your role",desc:"Host or Guest — each party files from their own device, independently"},
                  {n:"02",icon:"📋",title:"File your side",desc:"Enter property details and your evidence. A case ID is generated."},
                  {n:"03",icon:"⚖️",title:"AI verdict — Round 1",desc:"5 validators read both sides and reach a majority ruling onchain"},
                  {n:"04",icon:"🔁",title:"Appeal if needed",desc:"Disagree? File an appeal. Round 2 panel must address Round 1 reasoning."},
                ].map(s => (
                  <div key={s.n} className="poh-flow-step">
                    <div className="poh-flow-num">{s.n} —</div>
                    <div className="poh-flow-icon">{s.icon}</div>
                    <div className="poh-flow-title">{s.title}</div>
                    <div className="poh-flow-desc">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="poh-sample">
              <div className="poh-section-label">Live verdict example</div>
              <div className="poh-verdict-box">
                <div className="poh-verdict-hdr">
                  <span className="poh-verdict-id">Case #1 · 12 Adewale Street Lagos · 150,000 NGN</span>
                  <span className="poh-win-badge">✓ GUEST WINS</span>
                </div>
                <div className="poh-verdict-body">
                  <p className="poh-verdict-quote">&ldquo;The guest&apos;s move-in inspection report and messages prove the AC was faulty prior to check-in. The guest provided photographic proof of the apartment&apos;s cleanliness upon departure. Caution fee must be refunded.&rdquo;</p>
                  <div className="poh-chips">{["GPT-5.1 ✓","Grok-4 ✓","Qwen3-235b ✓","Claude Sonnet ✓","Majority Agree ✓"].map(c=><span key={c} className="poh-chip-agree">{c}</span>)}</div>
                </div>
              </div>
            </div>

            <div className="poh-load-box">
              <p className="poh-load-label">Have a case ID? Check status or load verdict →</p>
              <div className="poh-load-row">
                <input className="poh-input" placeholder="Enter case ID e.g. 3" value={loadId} onChange={e=>{setLoadId(e.target.value); setError("");}} />
                <button className="poh-btn-red" onClick={handleHomeLoad}>Check →</button>
              </div>
              {error && <p className="poh-error" style={{marginTop:"0.5rem"}}>{error}</p>}
            </div>
          </div>
        )}

        {/* ── ROLE SELECT ── */}
        {screen === "role_select" && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Before we begin</div>
              <h2 className="poh-form-title">Who are you?</h2>
              <p className="poh-form-sub">Select your role, then choose your path below.</p>
            </div>
            <div className="poh-role-grid">
              <button className={`poh-role-card poh-role-host ${myRole === "host" ? "poh-role-active-host" : ""}`} onClick={() => { setMyRole("host"); setError(""); }}>
                <span className="poh-role-icon">🏠</span>
                <span className="poh-role-title">I am the Host</span>
                <span className="poh-role-desc">I own or manage the property</span>
                {myRole === "host" && <span className="poh-role-check">✓ Selected</span>}
              </button>
              <button className={`poh-role-card poh-role-guest ${myRole === "guest" ? "poh-role-active-guest" : ""}`} onClick={() => { setMyRole("guest"); setError(""); }}>
                <span className="poh-role-icon">👤</span>
                <span className="poh-role-title">I am the Guest</span>
                <span className="poh-role-desc">I stayed at the property</span>
                {myRole === "guest" && <span className="poh-role-check">✓ Selected</span>}
              </button>
            </div>
            {error && <p className="poh-error" style={{marginBottom:"1rem"}}>{error}</p>}
            <div className="poh-two-paths">
              <div className="poh-path-card">
                <div className="poh-path-label">Starting the dispute</div>
                <p className="poh-path-desc">The other party hasn&apos;t filed yet. You go first — a case ID will be created.</p>
                <button className="poh-btn-red poh-btn-full" onClick={() => {
                  if (!myRole) { setError("Please select your role first"); return; }
                  setError(""); setScreen("create");
                }}>Start New Dispute →</button>
              </div>
              <div className="poh-path-divider"><span>or</span></div>
              <div className="poh-path-card">
                <div className="poh-path-label">Responding to a dispute</div>
                <p className="poh-path-desc">The other party already filed. Enter the ID they sent you.</p>
                <div style={{marginBottom:"0.75rem"}}>
                  <input className="poh-input" placeholder="Enter case ID e.g. 5" value={loadId} onChange={e=>{setLoadId(e.target.value); setError("");}} />
                </div>
                <button className="poh-btn-outline poh-btn-full" onClick={handleLoadToRespond}>Load &amp; Respond →</button>
              </div>
            </div>
          </div>
        )}

        {/* ── CREATE ── */}
        {screen === "create" && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Step 1 of 2 · Filing as {myLabel}</div>
              <h2 className="poh-form-title">File the Dispute</h2>
              <p className="poh-form-sub">Enter the property and agreement details. Both parties will see this.</p>
            </div>
            <div className="poh-card">
              <div className="poh-field">
                <label>Property Address</label>
                <input className="poh-input" placeholder="e.g. 12 Adewale Street, Lekki, Lagos" value={propertyAddress} onChange={e=>setPropertyAddress(e.target.value)} />
              </div>
              <div className="poh-field">
                <label>Caution Fee / Deposit Amount</label>
                <div className="poh-amount-row">
                  <select className="poh-currency-select" value={currency} onChange={e=>setCurrency(e.target.value)}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input className="poh-input poh-amount-input" placeholder="e.g. 150,000" value={depositAmount} onChange={e=>setDepositAmount(e.target.value)} />
                </div>
              </div>
              <div className="poh-field-row">
                <div className="poh-field"><label>Host Name</label><input className="poh-input" placeholder="e.g. Mr Bello" value={hostName} onChange={e=>setHostName(e.target.value)} /></div>
                <div className="poh-field"><label>Guest Name</label><input className="poh-input" placeholder="e.g. Miss Tunde" value={guestName} onChange={e=>setGuestName(e.target.value)} /></div>
              </div>
              <div className="poh-field">
                <label>Original Agreement Terms</label>
                <textarea className="poh-textarea" placeholder="Describe the original shortlet terms — what the caution fee covers, conditions for refund, check-in/check-out rules, etc." value={agreementTerms} onChange={e=>setAgreementTerms(e.target.value)} rows={4} />
              </div>
              {error && <p className="poh-error">{error}</p>}
              <button className="poh-btn-red poh-btn-full" onClick={handleCreateCase}>Create Dispute & Continue →</button>
            </div>
          </div>
        )}

        {/* ── MY CLAIM ── */}
        {screen === "my_claim" && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Step 2 of 2 · Your Evidence</div>
              <h2 className="poh-form-title">{myLabel}&apos;s Claim</h2>
              <p className="poh-form-sub">Case <strong className="poh-id-badge">#{caseId}</strong> is live. Submit your side now.</p>
            </div>
            <div className="poh-card">
              <div className={`poh-party-tag ${myTagClass}`}>{myIcon} {myLabel}&apos;s Side</div>
              <div className="poh-field">
                <label>Your Claim</label>
                <textarea className="poh-textarea"
                  placeholder={myRole === "host"
                    ? "Describe why you are withholding the caution fee. Be specific about what damage or rule violation occurred."
                    : "Describe why the caution fee should be refunded. Explain your stay and checkout condition."}
                  value={myClaim} onChange={e=>setMyClaim(e.target.value)} rows={4} />
              </div>
              <div className="poh-field">
                <label>Your Evidence</label>
                <textarea className="poh-textarea"
                  placeholder={myRole === "host"
                    ? "List your evidence — damage photos, repair invoices, inspection reports, WhatsApp messages, etc."
                    : "List your evidence — check-in photos, messages from host, receipts, WhatsApp screenshots, etc."}
                  value={myEvidence} onChange={e=>setMyEvidence(e.target.value)} rows={4} />
              </div>
              {error && <p className="poh-error">{error}</p>}
              <button className="poh-btn-red poh-btn-full" onClick={handleMyClaim}>Seal My Claim →</button>
            </div>
          </div>
        )}

        {/* ── RESPOND CLAIM ── */}
        {screen === "respond_claim" && caseData && (
          <div className="poh-form-wrap">
            <div className="poh-form-hdr">
              <div className="poh-step-tag">Responding to Case #{caseId} · As {myLabel}</div>
              <h2 className="poh-form-title">Submit Your Side</h2>
              <p className="poh-form-sub">Review the dispute details below, then tell your side of the story.</p>
            </div>
            <div className="poh-card">
              <div className="poh-dispute-context">
                <div className="poh-context-label">Dispute Details</div>
                <div className="poh-details-grid">
                  <span className="poh-dl">Property</span><span className="poh-dv">{caseData.property_address}</span>
                  <span className="poh-dl">Amount</span><span className="poh-dv">{caseData.deposit_amount}</span>
                  <span className="poh-dl">Host</span><span className="poh-dv">{caseData.host_name}</span>
                  <span className="poh-dl">Guest</span><span className="poh-dv">{caseData.guest_name}</span>
                </div>
                <div style={{marginTop:"1rem", borderTop:"1px solid var(--ink4)", paddingTop:"1rem"}}>
                  <div className="poh-dl" style={{marginBottom:"0.4rem"}}>Original Agreement Terms</div>
                  <p style={{fontSize:"0.83rem", color:"var(--muted2)", lineHeight:"1.65", margin:0}}>{caseData.agreement_terms}</p>
                </div>
              </div>
              <div className={`poh-party-tag ${myTagClass}`}>{myIcon} Your Response ({myLabel})</div>
              <div className="poh-field">
                <label>Your Claim</label>
                <textarea className="poh-textarea"
                  placeholder={myRole === "guest"
                    ? "Describe why the caution fee should be refunded. Be specific about your stay and checkout condition."
                    : "Describe why you are withholding the caution fee. Be specific about damage or rule violations."}
                  value={myClaim} onChange={e=>setMyClaim(e.target.value)} rows={4} />
              </div>
              <div className="poh-field">
                <label>Your Evidence</label>
                <textarea className="poh-textarea"
                  placeholder={myRole === "guest"
                    ? "List your evidence — check-in photos, messages from host, receipts, WhatsApp screenshots, etc."
                    : "List your evidence — damage photos, repair invoices, inspection reports, messages, etc."}
                  value={myEvidence} onChange={e=>setMyEvidence(e.target.value)} rows={4} />
              </div>
              {error && <p className="poh-error">{error}</p>}
              <button className="poh-btn-red poh-btn-full" onClick={handleRespondClaim}>Submit My Response →</button>
            </div>
          </div>
        )}

        {/* ── STATUS SCREEN ── */}
        {screen === "status" && (
          <div className="poh-form-wrap">
            {caseStatus === "waiting_other" && (
              <>
                <div className="poh-form-hdr">
                  <div className="poh-step-tag">Case #{caseId} · Waiting</div>
                  <h2 className="poh-form-title">Your claim is sealed ✓</h2>
                  <p className="poh-form-sub">{knownRole ? `The ${otherLabel} hasn't responded yet. Share the ID below.` : "The other party hasn't responded yet."}</p>
                </div>
                <div className="poh-card">
                  <div className="poh-share-id-block">
                    <p className="poh-share-label">Case ID{knownRole ? ` — share with the ${otherLabel}` : ""}:</p>
                    <div className="poh-share-id-row">
                      <div className="poh-share-id-num">#{caseId}</div>
                      <button className="poh-btn-outline" onClick={copyCaseId}>{copied ? "✓ Copied!" : "Copy ID"}</button>
                    </div>
                  </div>
                  {knownRole && (
                    <div className="poh-instructions-block">
                      <p className="poh-instructions-label">Tell the {otherLabel} to:</p>
                      <ol className="poh-instructions-list">
                        <li>Go to this website</li>
                        <li>Click &ldquo;File a Dispute&rdquo; → select <strong>&ldquo;I am the {otherLabel}&rdquo;</strong></li>
                        <li>Enter ID <strong className="poh-id-badge">#{caseId}</strong> and click &ldquo;Load &amp; Respond&rdquo;</li>
                        <li>Submit their side of the story</li>
                      </ol>
                    </div>
                  )}
                  <div className="poh-share-note">
                    <span className="poh-share-note-icon">💬</span>
                    <span>Send via WhatsApp, SMS, or email. They only need the ID number.</span>
                  </div>
                  <div className="poh-status-check-block">
                    <p className="poh-status-check-label">Once they&apos;ve responded, press this to check:</p>
                    <button className="poh-btn-red poh-btn-full" disabled={statusChecking}
                      onClick={async () => { setCheckResult(null); if (caseId) await checkStatus(caseId); }}>
                      {statusChecking ? "⏳ Checking the blockchain..." : `Check if ${knownRole ? otherLabel : "Other Party"} Has Responded →`}
                    </button>
                    {checkResult === "not_yet" && (
                      <div className="poh-check-result poh-check-waiting">
                        <span>⏳</span>
                        <span>{knownRole ? otherLabel : "Other party"} has <strong>not responded yet.</strong> Send them the ID and ask them to file their side.</span>
                      </div>
                    )}
                    {checkResult === "ready" && (
                      <div className="poh-check-result poh-check-ready">
                        <span>✅</span>
                        <span>Both sides are in! Scroll down to request the verdict.</span>
                      </div>
                    )}
                  </div>
                  {error && <p className="poh-error">{error}</p>}
                </div>
              </>
            )}

            {caseStatus === "ready_verdict" && (
              <>
                <div className="poh-form-hdr">
                  <div className="poh-step-tag">Case #{caseId} · Both Sides Filed</div>
                  <h2 className="poh-form-title">Ready for Verdict ⚖️</h2>
                  <p className="poh-form-sub">Both claims are sealed onchain. Either party can now summon the judges.</p>
                </div>
                <div className="poh-card">
                  <div className="poh-ready-banner">
                    <span className="poh-ready-icon">✅</span>
                    <div>
                      <div className="poh-ready-title">Both sides have filed their claims</div>
                      <div className="poh-ready-sub">The AI judges are standing by. This takes 30–60 seconds once requested.</div>
                    </div>
                  </div>
                  <div className="poh-validators-block">
                    <p className="poh-validators-label">5 AI validators will evaluate independently:</p>
                    <div className="poh-chips">
                      {["GPT-5.1","Grok-4","Qwen3-235b","Claude Sonnet","+ more"].map(c=><span key={c} className="poh-chip">{c}</span>)}
                    </div>
                    <p className="poh-pending-note">Each validator reads both sides and issues a verdict. Majority ruling is sealed permanently onchain.</p>
                  </div>
                  {error && <p className="poh-error">{error}</p>}
                  <button className="poh-btn-red poh-btn-full poh-btn-gavel" onClick={handleRequestVerdict}>⚖️ Request AI Verdict — Round 1</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── ROUND 1 VERDICT (with appeal option) ── */}
        {screen === "verdict" && caseData && (() => {
          const winner = resolveWinner(caseData);
          return (
            <div className="poh-verdict-screen">
              <div className={`poh-verdict-banner ${winner === "guest" ? "poh-guest-wins" : "poh-host-wins"}`}>
                <div className="poh-round-badge">⚖️ Round 1 Verdict · Case #{caseData.case_id}</div>
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
                  <p style={{marginBottom:"1.25rem"}}>Either party can accept this verdict or file an appeal. If appealed, a new panel of 5 validators will review the full case — and must explicitly address why they uphold or overturn this ruling. After Round 2, the verdict is locked forever.</p>
                  <div className="poh-appeal-actions">
                    {myRole && (
                      <>
                        <button className="poh-btn-red poh-btn-full" onClick={() => setScreen("appeal")}>
                          🔁 I Disagree — File an Appeal (Round 2)
                        </button>
                        <div className="poh-appeal-divider"><span>or</span></div>
                        <button className="poh-btn-green poh-btn-full" onClick={handleAcceptVerdict}>
                          ✓ I Accept This Verdict — Lock It Final
                        </button>
                      </>
                    )}
                    {!myRole && (
                      <>
                        <p className="poh-appeal-note">To file an appeal or accept this verdict, reload this case using your case ID and select your role first.</p>
                        <button className="poh-btn-outline poh-btn-full" onClick={() => { setLoadId(String(caseData.case_id)); setScreen("role_select"); }}>
                          Select My Role →
                        </button>
                      </>
                    )}
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
