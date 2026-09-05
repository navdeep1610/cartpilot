"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Minus,
  PackageCheck,
  Pause,
  Play,
  Plus,
  RefreshCw,
  LockKeyhole,
  Save,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { PublicCatalogProduct, PublicCatalogResponse } from "@/domain/catalog/public-catalog";
import {
  buildShopperIntentMessage,
  maximumConversationTurns,
  type ShoppingConversationTurn,
} from "@/domain/agents/conversation-context";
import {
  normalizeCustomerProfile,
  type CustomerProfileData,
  type SavedCustomerProfile,
} from "@/domain/customers/customer-profile";
import { parsePersistedCart, serializePersistedCart } from "@/domain/cart/persisted-cart";
import { formatInr } from "@/domain/money";
import type { CustomerOrder, CustomerOrdersResponse } from "@/domain/orders/customer-order";
import { removePurchasedLinesFromCart } from "@/domain/orders/complete-customer-order";

interface RecommendationResponse {
  status: "ready" | "clarification_required" | "professional_guidance" | "no_match";
  headline: string;
  summary: string;
  items: Array<{
    productId: string;
    variantId: string;
    productName: string;
    productType: string;
    size: string;
    pricePaise: number;
    routineStep: string;
    reason: string;
    warning: string | null;
  }>;
  safetyNotes: string[];
  clarificationQuestion: string | null;
  intentSource: "gemini" | "deterministic_fallback";
  agentRun: {
    runId: string;
    mode: "gemini_assisted" | "deterministic_fallback";
    outcome: "ready" | "clarification_required" | "professional_guidance" | "no_match";
    steps: Array<{
      stepId: "understand" | "catalog" | "safety" | "recommend";
      title: string;
      detail: string;
      status: "complete" | "needs_input" | "protected";
      authority: "ai_assisted" | "deterministic";
    }>;
    boundary: string;
  };
  suggestedReplies: string[];
  disclaimer: string;
}

interface AssistantTurn extends ShoppingConversationTurn {
  id: string;
}

interface CustomerOfferCandidate {
  candidateId: string;
  candidateType: string;
  lines: Array<{
    variantId: string;
    productId: string;
    productName: string;
    productType: string;
    size: string;
    quantity: number;
    unitPricePaise: number;
    lineDiscountPaise: number;
    lineFinalPaise: number;
  }>;
  grossPaise: number;
  savingPaise: number;
  totalPaise: number;
}

interface OfferResponse {
  decisionId: string;
  manifestVersion: string;
  selectedCandidateId: string;
  baselineCandidateId: string;
  evaluatedCartLines: Array<{ variantId: string; quantity: number }>;
  selected: CustomerOfferCandidate;
  baseline: CustomerOfferCandidate;
  explanation: {
    headline: string;
    summary: string;
    offerReason: string;
    discountMessage: string | null;
    safetyNotes: string[];
  };
  customerConfirmationRequired: true;
  orderCreationAuthorized: false;
  policy: {
    status: "passed" | "blocked";
    summary: string;
    passedChecks: string[];
    blockedReasonCodes: string[];
  };
}

interface CheckoutOrderResponse {
  paymentRecordId: string;
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: "INR";
  merchantName: string;
  description: string;
  testMode: true;
}

interface RazorpayCallback {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface CustomerProfileResponse {
  profile: SavedCustomerProfile | null;
  message?: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const productTones: Record<string, string> = {
  Cleanser: "mint",
  Serum: "sand",
  Moisturizer: "sage",
  Sunscreen: "peach",
  Toner: "sky",
  Exfoliant: "lilac",
  "Acne Treatment": "coral",
  Mask: "clay",
  "Eye Care": "blue",
  "Lip Care": "rose",
  Bundle: "gold",
};

const productImages: Record<string, string> = {
  Cleanser: "/products/cleanser.png",
  Serum: "/products/serum.png",
  Moisturizer: "/products/moisturizer.png",
  Sunscreen: "/products/sunscreen.png",
  Toner: "/products/toner.png",
  Exfoliant: "/products/exfoliant.png",
  "Acne Treatment": "/products/acne-treatment.png",
  Mask: "/products/mask.png",
  "Eye Care": "/products/eye-care.png",
  "Lip Care": "/products/lip-care.png",
  Bundle: "/products/bundle.png",
};

const emptyProfile: CustomerProfileData = {
  name: "",
  email: "",
  phone: "",
  deliveryAddress: "",
};

const profileStorageKey = "cartpilot-customer-profile-v1";
const cartStorageKey = "cartpilot-cart-v1";

const skinConcernCollections = [
  {
    id: "uneven_tone",
    label: "Uneven tone",
    description: "Brightening and dark-spot support for a more even-looking complexion.",
    concernKeys: ["uneven_tone", "uneven_tone_appearance", "dark_spots_appearance", "dullness"],
  },
  {
    id: "acne_control",
    label: "Acne control",
    description: "Catalog options for spots, clogged pores, blackheads and breakout-prone skin.",
    concernKeys: ["acne_prone", "individual_spots", "clogged_pores", "clogged_pores_appearance", "blackheads"],
  },
  {
    id: "oiliness",
    label: "Oiliness",
    description: "Lightweight care that supports oil control and a less shiny finish.",
    concernKeys: ["excess_oil", "matte_finish", "visible_pores", "lightweight_finish"],
  },
  {
    id: "wrinkles",
    label: "Wrinkles & fine lines",
    description: "Fine-line, texture and firmness support from suitable treatment products.",
    concernKeys: ["fine_lines", "firmness_appearance"],
  },
  {
    id: "dryness",
    label: "Dryness",
    description: "Hydration and barrier-support products for dry or dehydrated-feeling skin.",
    concernKeys: ["dryness", "dehydration", "deep_hydration", "hydration", "barrier_support"],
  },
] as const;

type SkinConcernId = (typeof skinConcernCollections)[number]["id"];

const bundleBannerProductIds = ["BND-001", "BND-002", "BND-003"] as const;

export function StorefrontExperience({ catalog }: { catalog: PublicCatalogResponse }) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeSkinConcern, setActiveSkinConcern] = useState<SkinConcernId>("uneven_tone");
  const [activeBundleSlide, setActiveBundleSlide] = useState(0);
  const [bundleBannerPaused, setBundleBannerPaused] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartStorageReady, setCartStorageReady] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profilePurpose, setProfilePurpose] = useState<"account" | "checkout">("account");
  const [profile, setProfile] = useState<CustomerProfileData>(emptyProfile);
  const [profileDraft, setProfileDraft] = useState<CustomerProfileData>(emptyProfile);
  const [profileStored, setProfileStored] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [profileSaveStatus, setProfileSaveStatus] = useState<"idle" | "saving">("idle");
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [ordersStatus, setOrdersStatus] = useState<"idle" | "loading" | "error">("idle");
  const [ordersMessage, setOrdersMessage] = useState<string | null>(null);
  const [assistantMessage, setAssistantMessage] = useState(
    "I have oily skin and clogged pores. Keep the routine simple.",
  );
  const [lastIntentMessage, setLastIntentMessage] = useState("Review my cart");
  const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(null);
  const [recommendationStatus, setRecommendationStatus] = useState<"idle" | "loading" | "error">("idle");
  const [assistantTurns, setAssistantTurns] = useState<AssistantTurn[]>([]);
  const [offer, setOffer] = useState<OfferResponse | null>(null);
  const [offerStatus, setOfferStatus] = useState<"idle" | "loading" | "error">("idle");
  const [acceptedOffer, setAcceptedOffer] = useState<OfferResponse | null>(null);
  const [exactTotalConfirmed, setExactTotalConfirmed] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState<"idle" | "preparing" | "waiting" | "success" | "failure">("idle");
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const checkoutAttemptRef = useRef<{
    fingerprint: string;
    confirmationKey: string;
    orderKey: string;
    verificationKey: string;
  } | null>(null);
  const assistantConversationRef = useRef<HTMLDivElement | null>(null);

  const categories = useMemo(
    () => ["All", ...new Set(catalog.products.map((product) => product.productType))],
    [catalog.products],
  );
  const productByVariant = useMemo(
    () =>
      new Map(
        catalog.products.flatMap((product) =>
          product.variants.map((variant) => [variant.variantId, { product, variant }] as const),
        ),
      ),
    [catalog.products],
  );
  const bannerBundles = useMemo(
    () =>
      bundleBannerProductIds
        .map((productId) => catalog.products.find((product) => product.productId === productId))
        .filter((product): product is PublicCatalogProduct => Boolean(product)),
    [catalog.products],
  );
  const bannerBundleCount = bannerBundles.length;
  const activeBannerBundle = bannerBundles[activeBundleSlide % Math.max(1, bannerBundles.length)];
  const activeBannerVariant = activeBannerBundle?.variants.find((variant) => variant.isDefault) ?? activeBannerBundle?.variants[0];
  const filteredProducts = catalog.products.filter(
    (product) => activeCategory === "All" || product.productType === activeCategory,
  );
  const visibleProducts = showAll ? filteredProducts : filteredProducts.slice(0, 6);
  const selectedSkinConcern = skinConcernCollections.find((concern) => concern.id === activeSkinConcern) ?? skinConcernCollections[0];
  const concernProducts = useMemo(
    () => productsForConcern(catalog.products, selectedSkinConcern.concernKeys).slice(0, 3),
    [catalog.products, selectedSkinConcern],
  );
  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, quantity]) => quantity > 0)
        .map(([variantId, quantity]) => ({ variantId, quantity })),
    [cart],
  );
  const cartCount = cartLines.reduce((total, line) => total + line.quantity, 0);
  const cartSubtotal = cartLines.reduce((total, line) => {
    const item = productByVariant.get(line.variantId);
    return total + (item?.variant.pricePaise ?? 0) * line.quantity;
  }, 0);
  const cartSignature = cartLines.map((line) => `${line.variantId}:${line.quantity}`).sort().join("|");

  useEffect(() => {
    const storedCart = parsePersistedCart(
      window.localStorage.getItem(cartStorageKey),
      new Set(productByVariant.keys()),
    );
    const animationFrame = window.requestAnimationFrame(() => {
      setCart(storedCart);
      setCartStorageReady(true);
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [productByVariant]);

  useEffect(() => {
    if (!cartStorageReady) return;
    try {
      if (Object.keys(cart).length === 0) window.localStorage.removeItem(cartStorageKey);
      else window.localStorage.setItem(cartStorageKey, serializePersistedCart(cart));
    } catch {
      // Checkout safety remains in memory when browser storage is unavailable.
    }
  }, [cart, cartStorageReady]);

  useEffect(() => {
    if (bundleBannerPaused || bannerBundleCount < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => {
      setActiveBundleSlide((current) => (current + 1) % bannerBundleCount);
    }, 6_500);
    return () => window.clearInterval(interval);
  }, [bannerBundleCount, bundleBannerPaused]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadProfile() {
      const legacyProfile = readLegacyProfile();
      try {
        const response = await fetch("/api/v1/customer-profile", {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json()) as CustomerProfileResponse | { message?: string };
        if (!response.ok || !("profile" in result)) throw new Error(result.message || "Profile unavailable");
        if (result.profile) {
          const savedProfile = customerProfileData(result.profile);
          setProfile(savedProfile);
          setProfileDraft(savedProfile);
          setProfileStored(true);
          window.localStorage.removeItem(profileStorageKey);
          return;
        }

        if (legacyProfile && isCompleteProfile(legacyProfile)) {
          const migrationResponse = await fetch("/api/v1/customer-profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(legacyProfile),
            signal: controller.signal,
          });
          const migration = (await migrationResponse.json()) as CustomerProfileResponse | { message?: string };
          if (migrationResponse.ok && "profile" in migration && migration.profile) {
            const savedProfile = customerProfileData(migration.profile);
            setProfile(savedProfile);
            setProfileDraft(savedProfile);
            setProfileStored(true);
            window.localStorage.removeItem(profileStorageKey);
            return;
          }
        }

        if (legacyProfile) {
          setProfile(legacyProfile);
          setProfileDraft(legacyProfile);
        }
      } catch {
        if (legacyProfile && !controller.signal.aborted) {
          setProfile(legacyProfile);
          setProfileDraft(legacyProfile);
        }
      }
    }
    void loadProfile();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (cartLines.length === 0 || acceptedOffer) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setOfferStatus("loading");
      try {
        const response = await fetch("/api/v1/offers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cartLines, message: lastIntentMessage }),
          signal: controller.signal,
        });
        const data = (await response.json()) as OfferResponse | { message?: string };
        if (!response.ok || !("selected" in data)) throw new Error("Offer unavailable");
        setOffer(data);
        setOfferStatus("idle");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setOfferStatus("error");
      }
    }, 450);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [cartSignature, lastIntentMessage, acceptedOffer, cartLines]);

  useEffect(() => {
    const conversation = assistantConversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [assistantTurns]);

  function requestRoutine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = assistantMessage.trim();
    if (message.length < 3) return;
    setAssistantMessage("");
    void runRoutine(message);
  }

  async function runRoutine(
    displayMessage: string,
    requestMessage = displayMessage,
    conversation: readonly AssistantTurn[] = assistantTurns,
  ) {
    setRecommendationStatus("loading");
    setLastIntentMessage(buildShopperIntentMessage(conversation, requestMessage));
    setAssistantTurns((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "shopper", message: displayMessage } satisfies AssistantTurn,
    ].slice(-maximumConversationTurns));
    try {
      const response = await fetch("/api/v1/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: requestMessage,
          conversation: conversation.map(({ role, message }) => ({ role, message })),
        }),
      });
      const data = (await response.json()) as RecommendationResponse | { message?: string };
      if (!response.ok || !("status" in data)) throw new Error("Recommendation unavailable");
      setRecommendation(data);
      setAssistantTurns((current) => [
        ...current,
        ({
          id: crypto.randomUUID(),
          role: "assistant",
          message: data.clarificationQuestion ?? data.summary,
        } satisfies AssistantTurn),
      ].slice(-maximumConversationTurns));
      setRecommendationStatus("idle");
    } catch {
      setRecommendationStatus("error");
      setAssistantTurns((current) => [
        ...current,
        ({
          id: crypto.randomUUID(),
          role: "assistant",
          message: "I could not reach the recommendation service. Your cart is unchanged, and you can retry safely.",
        } satisfies AssistantTurn),
      ].slice(-maximumConversationTurns));
    }
  }

  function continueRoutine(reply: string) {
    setAssistantMessage("");
    void runRoutine(reply);
  }

  function openProfile() {
    setProfileDraft(profile);
    setProfileMessage(null);
    setProfilePurpose("account");
    setCartOpen(false);
    setOrdersOpen(false);
    setProfileOpen(true);
  }

  function closeProfile() {
    const returnToCart = profilePurpose === "checkout";
    setProfileOpen(false);
    setProfilePurpose("account");
    if (returnToCart) setCartOpen(true);
  }

  function openOrders() {
    setCartOpen(false);
    setProfileOpen(false);
    setProfilePurpose("account");
    setOrdersOpen(true);
    void loadCustomerOrders();
  }

  async function loadCustomerOrders() {
    setOrdersStatus("loading");
    setOrdersMessage(null);
    try {
      const response = await fetch("/api/v1/customer-orders", { cache: "no-store" });
      const result = (await response.json()) as CustomerOrdersResponse | { message?: string };
      if (!response.ok || !("orders" in result)) {
        const message = "message" in result ? result.message : null;
        throw new Error(message || "Your orders could not be loaded.");
      }
      setCustomerOrders(result.orders);
      setOrdersStatus("idle");
    } catch (error) {
      setOrdersStatus("error");
      setOrdersMessage((error as Error).message || "Your orders could not be loaded just now.");
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedProfile = normalizeCustomerProfile(profileDraft);
    if (!normalizedProfile) {
      setProfileMessage({ tone: "error", text: "Enter valid contact details and a complete delivery address." });
      return;
    }

    setProfileSaveStatus("saving");
    setProfileMessage({ tone: "info", text: "Saving your profile securely in Supabase..." });
    try {
      const response = await fetch("/api/v1/customer-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedProfile),
      });
      const result = (await response.json()) as CustomerProfileResponse | { message?: string };
      if (!response.ok || !("profile" in result) || !result.profile) {
        throw new Error(result.message || "Your profile could not be saved securely.");
      }
      const savedProfile = customerProfileData(result.profile);
      setProfile(savedProfile);
      setProfileDraft(savedProfile);
      setProfileStored(true);
      window.localStorage.removeItem(profileStorageKey);
      if (profilePurpose === "checkout") {
        setProfileMessage(null);
        setProfileOpen(false);
        setProfilePurpose("account");
        setCartOpen(true);
      } else {
        setProfileMessage({ tone: "success", text: "Profile saved in Supabase and ready for checkout." });
      }
    } catch (error) {
      setProfileMessage({ tone: "error", text: (error as Error).message || "Your profile could not be saved securely." });
    } finally {
      setProfileSaveStatus("idle");
    }
  }

  function addVariant(variantId: string, quantity = 1) {
    setAcceptedOffer(null);
    setOffer(null);
    setExactTotalConfirmed(false);
    setCheckoutMessage(null);
    setCart((current) => ({ ...current, [variantId]: Math.min(10, (current[variantId] ?? 0) + quantity) }));
    setProfileOpen(false);
    setOrdersOpen(false);
    setCartOpen(true);
  }

  function changeBundleSlide(direction: -1 | 1) {
    if (bannerBundles.length < 2) return;
    setActiveBundleSlide((current) => (current + direction + bannerBundles.length) % bannerBundles.length);
  }

  function viewBundle(productId: string) {
    setActiveCategory("Bundle");
    setShowAll(true);
    window.setTimeout(() => {
      document.getElementById(`product-${productId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  function updateQuantity(variantId: string, nextQuantity: number) {
    setAcceptedOffer(null);
    setOffer(null);
    setExactTotalConfirmed(false);
    setCheckoutMessage(null);
    setCart((current) => {
      const next = { ...current };
      if (nextQuantity <= 0) delete next[variantId];
      else next[variantId] = Math.min(10, nextQuantity);
      return next;
    });
  }

  function addRoutine() {
    if (!recommendation) return;
    setAcceptedOffer(null);
    setOffer(null);
    setExactTotalConfirmed(false);
    setCheckoutMessage(null);
    setCart((current) => {
      const next = { ...current };
      for (const item of recommendation.items) {
        next[item.variantId] = Math.min(10, (next[item.variantId] ?? 0) + 1);
      }
      return next;
    });
    setProfileOpen(false);
    setOrdersOpen(false);
    setCartOpen(true);
  }

  function acceptSelectedOffer() {
    if (!offer) return;
    setCart(Object.fromEntries(offer.selected.lines.map((line) => [line.variantId, line.quantity])));
    setAcceptedOffer(offer);
    setExactTotalConfirmed(false);
    setOffer(null);
  }

  async function beginTestCheckout() {
    const activeOffer = acceptedOffer ?? offer;
    const confirmedCandidate = acceptedOffer?.selected ?? offer?.baseline;
    if (
      !activeOffer ||
      !confirmedCandidate ||
      activeOffer.policy.status !== "passed" ||
      !exactTotalConfirmed ||
      checkoutStatus === "preparing"
    ) return;
    if (!profileStored || !isCompleteProfile(profile)) {
      setProfileDraft(profile);
      setCartOpen(false);
      setOrdersOpen(false);
      setProfilePurpose("checkout");
      setProfileOpen(true);
      setProfileMessage({ tone: "info", text: "Add and save your personal details. You will return to your cart afterward." });
      return;
    }
    setCheckoutStatus("preparing");
    setCheckoutMessage("Revalidating your exact cart and total...");
    const fingerprint = `${activeOffer.decisionId}:${confirmedCandidate.candidateId}:${confirmedCandidate.totalPaise}`;
    if (checkoutAttemptRef.current?.fingerprint !== fingerprint) {
      checkoutAttemptRef.current = {
        fingerprint,
        confirmationKey: `confirm:${crypto.randomUUID()}`,
        orderKey: `order:${crypto.randomUUID()}`,
        verificationKey: `verify:${crypto.randomUUID()}`,
      };
    }
    const attempt = checkoutAttemptRef.current;
    try {
      const confirmationResponse = await fetch("/api/v1/checkout/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.confirmationKey },
        body: JSON.stringify({
          evaluatedCartLines: activeOffer.evaluatedCartLines,
          message: lastIntentMessage,
          expectedDecisionId: activeOffer.decisionId,
          expectedCandidateId: confirmedCandidate.candidateId,
          expectedTotalPaise: confirmedCandidate.totalPaise,
          customer: profile,
        }),
      });
      const confirmation = (await confirmationResponse.json()) as { paymentRecordId?: string; message?: string };
      if (!confirmationResponse.ok || !confirmation.paymentRecordId) {
        throw new Error(confirmation.message || "The cart could not be confirmed.");
      }

      const orderResponse = await fetch(`/api/v1/payment-records/${confirmation.paymentRecordId}/order`, {
        method: "POST",
        headers: { "Idempotency-Key": attempt.orderKey },
      });
      const order = (await orderResponse.json()) as CheckoutOrderResponse | { message?: string };
      if (!orderResponse.ok || !("orderId" in order)) {
        throw new Error((order as { message?: string }).message || "Test checkout could not be opened.");
      }

      await loadRazorpayCheckout();
      if (!window.Razorpay) throw new Error("Razorpay Checkout did not load.");
      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        timeout: 3600,
        name: order.merchantName,
        description: order.description,
        prefill: {
          name: profile.name,
          email: profile.email,
          contact: profile.phone,
        },
        handler: async (callback: RazorpayCallback) => {
          setCheckoutStatus("waiting");
          setCheckoutMessage("Payment response received. Verifying capture on the server...");
          const verificationResponse = await fetch(`/api/v1/payment-records/${order.paymentRecordId}/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.verificationKey },
            body: JSON.stringify(callback),
          });
          const verification = (await verificationResponse.json()) as { message?: string };
          if (!verificationResponse.ok) {
            setCheckoutStatus("failure");
            setCheckoutMessage(verification.message || "The payment response could not be verified. Fulfilment remains blocked.");
            checkoutAttemptRef.current = { ...attempt, orderKey: `retry:${crypto.randomUUID()}`, verificationKey: `verify:${crypto.randomUUID()}` };
            return;
          }
          await pollPaymentStatus(order.paymentRecordId, confirmedCandidate.lines);
        },
        modal: {
          ondismiss: () => {
            setCheckoutStatus("idle");
            setCheckoutMessage("Test checkout was closed. The cart is retained and fulfilment remains blocked.");
          },
        },
        theme: { color: "#20342a" },
        notes: { payment_record_id: order.paymentRecordId },
      });
      checkout.open();
      setCheckoutStatus("waiting");
      setCheckoutMessage("Razorpay Test checkout opened. No real money will be charged.");
    } catch (error) {
      setCheckoutStatus("failure");
      setCheckoutMessage((error as Error).message || "Checkout could not be started safely.");
    }
  }

  async function pollPaymentStatus(
    paymentRecordId: string,
    purchasedLines: CustomerOfferCandidate["lines"],
  ) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 700 : 1_500));
      const response = await fetch(`/api/v1/payment-records/${paymentRecordId}`, { cache: "no-store" });
      if (!response.ok) continue;
      const status = (await response.json()) as {
        state: string;
        fulfilmentAuthorized: boolean;
        customerMessage: string;
      };
      setCheckoutMessage(status.customerMessage);
      if (status.fulfilmentAuthorized) {
        setCheckoutStatus("success");
        completeSuccessfulOrder(purchasedLines);
        return;
      }
      if (status.state === "payment_failed") {
        setCheckoutStatus("failure");
        setCheckoutMessage(`${status.customerMessage} Click Pay again to retry the same protected order.`);
        const currentAttempt = checkoutAttemptRef.current;
        if (currentAttempt) checkoutAttemptRef.current = { ...currentAttempt, orderKey: `retry:${crypto.randomUUID()}`, verificationKey: `verify:${crypto.randomUUID()}` };
        return;
      }
    }
    setCheckoutStatus("waiting");
    setCheckoutMessage("Payment response verified. Capture confirmation may take a moment; fulfilment remains blocked until it arrives.");
  }

  function completeSuccessfulOrder(purchasedLines: CustomerOfferCandidate["lines"]) {
    setCart((current) => removePurchasedLinesFromCart(current, purchasedLines));
    setAcceptedOffer(null);
    setOffer(null);
    setExactTotalConfirmed(false);
    checkoutAttemptRef.current = null;
    setCartOpen(false);
    setProfileOpen(false);
    setOrdersOpen(true);
    void loadCustomerOrders();
  }

  const displayedTotal = acceptedOffer?.selected.totalPaise ?? offer?.baseline.totalPaise ?? cartSubtotal;
  const hasAdditionalOffer = offer && offer.selectedCandidateId !== offer.baselineCandidateId;
  const activeDecision = acceptedOffer ?? offer;
  const policyPassed = activeDecision?.policy.status === "passed";

  return (
    <main id="top">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="CartPilot home">Cart<span>Pilot</span></a>
        <nav aria-label="Store navigation">
          <a href="#shop">Shop</a>
          <a href="#assistant">AI routine</a>
          <a href="#how-it-works">How it works</a>
          <Link href="/merchant">Merchant view</Link>
        </nav>
        <div className="header-actions">
          <button className="orders-button" type="button" onClick={openOrders} aria-label="Open my orders">
            <PackageCheck size={17} aria-hidden="true" /> <span>My orders</span>
          </button>
          <button className="profile-button" type="button" onClick={openProfile} aria-label="Open my profile">
            <UserRound size={17} aria-hidden="true" /> <span>Profile</span>
          </button>
          <button className="cart-button" type="button" onClick={() => { setProfileOpen(false); setOrdersOpen(false); setCartOpen(true); }} aria-label={`Open cart with ${cartCount} items`}>
            <ShoppingBag size={17} aria-hidden="true" /> Cart <span>{cartCount}</span>
          </button>
        </div>
      </header>

      {activeBannerBundle && activeBannerVariant && (
        <section className="bundle-banner" aria-label="Best bundle offers" aria-roledescription="carousel">
          <div className="bundle-banner-inner" key={activeBannerBundle.productId} aria-live="polite">
            <div className="bundle-banner-copy">
              <p className="bundle-banner-kicker"><Sparkles size={16} aria-hidden="true" /> Best bundle offer</p>
              <p className="bundle-banner-count">Bundle {activeBundleSlide + 1} of {bannerBundles.length}</p>
              <h2>{activeBannerBundle.productName}</h2>
              <p className="bundle-banner-description">{activeBannerBundle.useCase}</p>
              <p className="bundle-banner-proof">One complete 3-product routine · catalog-backed price</p>
              <div className="bundle-banner-actions">
                <strong>{formatInr(activeBannerVariant.pricePaise)}</strong>
                <button className="button button-dark" type="button" onClick={() => addVariant(activeBannerVariant.variantId)}>
                  Add full kit <ShoppingBag size={17} aria-hidden="true" />
                </button>
                <button className="button button-light" type="button" onClick={() => viewBundle(activeBannerBundle.productId)}>
                  View bundle
                </button>
              </div>
            </div>

            <div className="bundle-banner-visual">
              <span aria-hidden="true" />
              <Image
                src={productImages.Bundle}
                alt={`${activeBannerBundle.productName} product packshot`}
                fill
                priority
                sizes="(max-width: 900px) 82vw, 42vw"
              />
            </div>
          </div>

          <div className="bundle-banner-controls">
            <button type="button" onClick={() => changeBundleSlide(-1)} aria-label="Show previous bundle offer"><ArrowLeft size={18} aria-hidden="true" /></button>
            <div className="bundle-banner-dots" role="group" aria-label="Choose a bundle offer">
              {bannerBundles.map((bundle, index) => (
                <button
                  type="button"
                  className={activeBundleSlide === index ? "active" : ""}
                  aria-label={`Show ${bundle.productName}`}
                  aria-pressed={activeBundleSlide === index}
                  key={bundle.productId}
                  onClick={() => setActiveBundleSlide(index)}
                ><span>{String(index + 1).padStart(2, "0")}</span></button>
              ))}
            </div>
            <button type="button" onClick={() => changeBundleSlide(1)} aria-label="Show next bundle offer"><ArrowRight size={18} aria-hidden="true" /></button>
            <button type="button" onClick={() => setBundleBannerPaused((current) => !current)} aria-label={bundleBannerPaused ? "Resume automatic bundle slides" : "Pause automatic bundle slides"}>
              {bundleBannerPaused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
            </button>
          </div>
        </section>
      )}

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Track 01 · AI Growth &amp; Agentic Commerce</p>
          <h1>An AI sales agent for better routines and stronger carts.</h1>
          <p className="hero-lede">
            CartPilot turns a shopper&apos;s goal into a compatible, profit-positive offer. AI understands the request; merchant-controlled rules own products, prices, discounts and payment authority.
          </p>
          <div className="hero-actions">
            <a className="button button-dark" href="#shop">Shop essentials</a>
            <a className="button button-light" href="#assistant">Ask CartPilot</a>
          </div>
          <div className="trust-row" aria-label="Store promises">
            <span>Explainable</span><span>Bounded</span><span>Customer-gated</span><span>Razorpay Test Mode</span>
          </div>
        </div>

        <aside className="assistant-card" id="assistant" aria-labelledby="assistant-title">
          <div className="assistant-heading">
            <span className="assistant-mark" aria-hidden="true"><Sparkles size={22} /></span>
            <div><p className="eyebrow">Shopping assistant</p><h2 id="assistant-title">What does your skin need?</h2></div>
          </div>
          <p>Tell me your skin type and one concern. I will suggest a short routine from products the merchant actually sells.</p>
          {assistantTurns.length > 0 && (
            <div ref={assistantConversationRef} className="assistant-conversation" aria-live="polite" aria-label="Conversation with CartPilot">
              {assistantTurns.map((turn) => (
                <div className={`assistant-turn ${turn.role}`} key={turn.id}>
                  <span>{turn.role === "shopper" ? "You" : "CartPilot"}</span>
                  <p>{turn.message}</p>
                </div>
              ))}
            </div>
          )}
          {recommendationStatus === "loading" && (
            <div className="agent-progress" role="status">
              <span><i /> Understanding your request</span>
              <span><i /> Checking catalog and safety rules</span>
            </div>
          )}
          <form className="assistant-form" onSubmit={requestRoutine}>
            <label htmlFor="skin-concern">Your skin and shopping goal</label>
            <textarea
              id="skin-concern"
              value={assistantMessage}
              onChange={(event) => setAssistantMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (recommendationStatus !== "loading") event.currentTarget.form?.requestSubmit();
              }}
              maxLength={1000}
              aria-describedby="assistant-keyboard-hint"
              placeholder="Ask another skincare or shopping question..."
            />
            <small className="assistant-keyboard-hint" id="assistant-keyboard-hint">Enter to send · Shift+Enter for a new line</small>
            <button type="submit" disabled={recommendationStatus === "loading"}>
              {recommendationStatus === "loading" ? "Checking the catalog..." : "Build my routine"}
              {recommendationStatus !== "loading" && <ArrowRight size={17} aria-hidden="true" />}
            </button>
          </form>
          {recommendation?.suggestedReplies.length ? (
            <div className="assistant-replies" aria-label="Suggested follow-up messages">
              <span>Continue the conversation</span>
              <div>{recommendation.suggestedReplies.map((reply) => (
                <button type="button" disabled={recommendationStatus === "loading"} key={reply} onClick={() => continueRoutine(reply)}>{reply}</button>
              ))}</div>
            </div>
          ) : null}
          {recommendationStatus === "error" && (
            <div className="assistant-recovery" role="alert">
              <p>I could not build a routine just now. Your cart was not changed.</p>
              <button type="button" onClick={() => void runRoutine("Retry my last request", lastIntentMessage, [])}>Retry safely</button>
            </div>
          )}
          <small>Demo skincare guidance only. Not medical advice.</small>
        </aside>
      </section>

      {recommendation && (
        <section className="routine-result" aria-live="polite">
          <div className="routine-summary">
            <p className="eyebrow">Your catalog-backed routine</p>
            <h2>{recommendation.headline}</h2>
            <p>{recommendation.clarificationQuestion ?? recommendation.summary}</p>
            <span className="source-pill"><ShieldCheck size={15} /> {recommendation.intentSource === "gemini" ? "Gemini understood your request" : "Safe fallback used"}</span>
          </div>
          <div className="routine-output">
            <div className="agent-run-card">
              <div className="agent-run-heading">
                <div><p className="eyebrow">Agent activity</p><h3>What CartPilot did</h3></div>
                <span>{recommendation.agentRun.runId.slice(0, 8)}</span>
              </div>
              <ol>
                {recommendation.agentRun.steps.map((step) => (
                  <li className={step.status} key={step.stepId}>
                    <span className="agent-step-icon">{step.status === "complete" ? <Check size={15} /> : <ShieldCheck size={15} />}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.detail}</p>
                      <small>{step.authority === "ai_assisted" ? "AI-assisted interpretation" : "Deterministic merchant rule"}</small>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="agent-boundary"><LockKeyhole size={15} /> {recommendation.agentRun.boundary}</p>
            </div>
            {recommendation.items.length > 0 && (
              <div className="routine-items">
                {recommendation.items.map((item, index) => (
                  <article key={item.variantId}>
                    <span className="routine-order">{String(index + 1).padStart(2, "0")}</span>
                    <div><small>{item.routineStep.replaceAll("_", " ")}</small><h3>{item.productName}</h3><p>{item.reason}</p></div>
                    <strong>{formatInr(item.pricePaise)}</strong>
                  </article>
                ))}
                <button className="button button-dark" type="button" onClick={addRoutine}>Add the routine to cart</button>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="shop-section" id="shop">
        <div className="section-heading">
          <div><p className="eyebrow">The merchant catalog</p><h2>Find your daily essentials</h2></div>
          <p>{catalog.products.length} products · prices include all available sizes</p>
        </div>
        <div className="category-strip" role="group" aria-label="Filter products by category">
          {categories.map((category) => (
            <button type="button" className={activeCategory === category ? "active" : ""} key={category} onClick={() => { setActiveCategory(category); setShowAll(false); }}>
              {category}
            </button>
          ))}
        </div>
        <div className="product-grid">
          {visibleProducts.map((product) => <ProductCard product={product} elementId={`product-${product.productId}`} key={product.productId} onAdd={addVariant} />)}
        </div>
        {filteredProducts.length > 6 && (
          <button className="show-more" type="button" onClick={() => setShowAll((current) => !current)}>
            {showAll ? "Show fewer products" : `View all ${filteredProducts.length} products`} <ChevronDown size={17} className={showAll ? "rotated" : ""} />
          </button>
        )}
      </section>

      <section className="concern-section" id="skin-concerns">
        <div className="section-heading concern-heading">
          <div><p className="eyebrow">Shop by skin concern</p><h2>Start with what your skin needs.</h2></div>
          <p>Choose a concern to see suitable matches drawn directly from the merchant catalog.</p>
        </div>

        <div className="concern-picker" role="group" aria-label="Choose a skin concern">
          {skinConcernCollections.map((concern, index) => {
            const productCount = productsForConcern(catalog.products, concern.concernKeys).length;
            const isActive = concern.id === selectedSkinConcern.id;
            return (
              <button
                type="button"
                className={isActive ? "active" : ""}
                aria-pressed={isActive}
                key={concern.id}
                onClick={() => setActiveSkinConcern(concern.id)}
              >
                <span className="concern-number">{String(index + 1).padStart(2, "0")}</span>
                <h3>{concern.label}</h3>
                <p>{concern.description}</p>
                <small>{productCount} catalog {productCount === 1 ? "match" : "matches"}</small>
              </button>
            );
          })}
        </div>

        <div className="concern-results" aria-live="polite">
          <div className="concern-results-heading">
            <div><p className="eyebrow">Selected concern</p><h3>{selectedSkinConcern.label}</h3></div>
            <p>Showing the best {concernProducts.length} catalog {concernProducts.length === 1 ? "match" : "matches"} for this concern.</p>
          </div>
          <div className="product-grid concern-product-grid">
            {concernProducts.map((product) => <ProductCard product={product} key={`${selectedSkinConcern.id}-${product.productId}`} onAdd={addVariant} />)}
          </div>
        </div>

        <p className="concern-disclaimer">General skincare shopping guidance only. This section does not diagnose or treat a medical condition.</p>
      </section>

      <section className="how-section" id="how-it-works">
        <p className="eyebrow">The hackathon commerce contract</p>
        <h2>Every money action has a reason, a limit and a human gate.</h2>
        <p className="how-intro">CartPilot follows one clear Track 01 route: grow merchant contribution profit with relevant bundles and cross-sells on Razorpay Test Mode.</p>
        <div className="how-grid">
          <article><span>01 · Explainable</span><h3>Understand</h3><p>AI turns the shopper&apos;s words into structured intent and a clear recommendation. It never decides prices.</p></article>
          <article><span>02 · Bounded</span><h3>Validate</h3><p>The backend checks catalog fit, compatibility, inventory, budget, discounts and merchant profit rules.</p></article>
          <article><span>03 · Gated</span><h3>Confirm</h3><p>The shopper sees the exact cart and total. No Razorpay order is created until they explicitly approve it.</p></article>
          <article><span>04 · Audited</span><h3>Verify</h3><p>Confirmed orders carry decision and payment evidence, and fulfilment remains blocked until server-verified capture.</p></article>
        </div>
      </section>

      <footer>
        <div><div className="brand">Cart<span>Pilot</span></div><p>Smarter skincare. Stronger carts.</p></div>
        <p>Track 01 · AI Growth &amp; Agentic Commerce · Razorpay Test Mode only</p>
      </footer>

      {(cartOpen || profileOpen || ordersOpen) && (
        <button
          className="cart-backdrop"
          type="button"
          aria-label="Close open panel"
          onClick={() => { setCartOpen(false); setProfileOpen(false); setOrdersOpen(false); setProfilePurpose("account"); }}
        />
      )}
      <aside className={`cart-drawer orders-drawer ${ordersOpen ? "open" : ""}`} aria-hidden={!ordersOpen} aria-labelledby="orders-title">
        <div className="cart-heading">
          <div><p className="eyebrow">Your purchases</p><h2 id="orders-title">My orders</h2></div>
          <button type="button" className="icon-button" onClick={() => setOrdersOpen(false)} aria-label="Close orders"><X /></button>
        </div>
        <p className="orders-intro">Paid products move here after capture is verified. Failed or unfinished payments stay safely in your cart.</p>
        {ordersStatus === "loading" ? (
          <div className="customer-orders-message" role="status"><RefreshCw className="spin" /><div><h3>Loading your orders</h3><p>Reading your captured Test Mode purchases from Supabase.</p></div></div>
        ) : ordersStatus === "error" ? (
          <div className="customer-orders-message error" role="alert">
            <PackageCheck />
            <div><h3>Orders are temporarily unavailable</h3><p>{ordersMessage}</p><button type="button" onClick={() => void loadCustomerOrders()}>Try again</button></div>
          </div>
        ) : !profileStored ? (
          <div className="customer-orders-message">
            <UserRound />
            <div><h3>Add your personal details first</h3><p>Your secure customer identifier connects this browser to its order history.</p><button type="button" onClick={openProfile}>Add personal details</button></div>
          </div>
        ) : customerOrders.length === 0 ? (
          <div className="customer-orders-message">
            <PackageCheck />
            <div><h3>No completed orders yet</h3><p>After Razorpay confirms a captured Test Mode payment, the products will appear here.</p></div>
          </div>
        ) : (
          <div className="customer-order-list" aria-live="polite">
            {customerOrders.map((order) => (
              <article className="customer-order-card" key={order.orderId}>
                <header>
                  <div><small>Order</small><h3>{order.orderId}</h3><p>{formatCustomerOrderDate(order.placedAt)}</p></div>
                  <span><Check size={14} /> Confirmed</span>
                </header>
                <div className="customer-order-lines">
                  {order.lines.map((line) => (
                    <div key={line.variantId}>
                      <div className={`cart-thumb ${productTones[line.productType] ?? "mint"}`}>
                        <Image src={productImages[line.productType] ?? productImages.Cleanser} alt="" fill sizes="54px" />
                      </div>
                      <div><small>{line.productType} · {line.size}</small><strong>{line.productName}</strong><span>Quantity {line.quantity}</span></div>
                      <strong>{formatInr(line.lineTotalPaise)}</strong>
                    </div>
                  ))}
                </div>
                <div className="customer-order-total"><span>{order.statusLabel}</span><strong>{formatInr(order.amountPaise)}</strong></div>
                <small className="customer-order-mode"><ShieldCheck size={13} /> Razorpay Test Mode order</small>
              </article>
            ))}
          </div>
        )}
        <p className="orders-privacy-note"><LockKeyhole size={14} /> Orders are loaded only for the secure customer identifier stored in this browser.</p>
      </aside>
      <aside className={`cart-drawer profile-drawer ${profileOpen ? "open" : ""}`} aria-hidden={!profileOpen} aria-labelledby="profile-title">
        <div className="cart-heading">
          <div><p className="eyebrow">{profilePurpose === "checkout" ? "Before checkout" : "Your account"}</p><h2 id="profile-title">{profilePurpose === "checkout" ? "Add personal details" : "My profile"}</h2></div>
          <button type="button" className="icon-button" onClick={closeProfile} aria-label="Close profile"><X /></button>
        </div>
        <p className="profile-intro">{profilePurpose === "checkout" ? "Save these details once and you will return directly to your cart to continue checkout." : "Your contact and delivery details are required before placing an order. They prefill Test Mode checkout and are saved with an order only after you confirm payment."}</p>
        <p className={`profile-requirement ${profileStored && isCompleteProfile(profile) ? "complete" : "incomplete"}`}>
          {profileStored && isCompleteProfile(profile) ? <Check size={16} /> : <UserRound size={16} />}
          {profileStored && isCompleteProfile(profile) ? "Profile stored in Supabase — ready for checkout." : "Save your complete profile in Supabase before checkout."}
        </p>
        <form className="profile-form" onSubmit={saveProfile}>
          <label htmlFor="profile-name">Full name
            <input id="profile-name" name="name" autoComplete="name" required minLength={2} maxLength={80} value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label htmlFor="profile-email">Email address
            <input id="profile-email" name="email" type="email" autoComplete="email" required maxLength={120} value={profileDraft.email} onChange={(event) => setProfileDraft((current) => ({ ...current, email: event.target.value }))} />
          </label>
          <label htmlFor="profile-phone">Phone number
            <input id="profile-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required pattern="(?=(?:\D*\d){8,15}\D*$)[0-9+() -]{8,20}" maxLength={20} placeholder="+91 98765 43210" value={profileDraft.phone} onChange={(event) => setProfileDraft((current) => ({ ...current, phone: event.target.value }))} />
          </label>
          <label htmlFor="profile-address">Delivery address
            <textarea id="profile-address" name="address" autoComplete="street-address" required minLength={8} maxLength={300} rows={4} value={profileDraft.deliveryAddress} onChange={(event) => setProfileDraft((current) => ({ ...current, deliveryAddress: event.target.value }))} />
          </label>
          <button type="submit" disabled={profileSaveStatus === "saving"}><Save size={17} /> {profileSaveStatus === "saving" ? "Saving to Supabase..." : profilePurpose === "checkout" ? "Save and return to cart" : "Save profile"}</button>
          {profileMessage && <p className={`profile-saved ${profileMessage.tone}`} role="status"><ShieldCheck size={16} /> {profileMessage.text}</p>}
        </form>
        <section className="payment-security" aria-labelledby="payment-security-title">
          <LockKeyhole size={21} />
          <div><h3 id="payment-security-title">Payment details stay with Razorpay</h3><p>CartPilot never stores card numbers, CVVs, UPI PINs, bank passwords, or OTPs. If you choose “Save this card” inside Razorpay, Razorpay handles that securely.</p></div>
        </section>
        <small className="device-storage-note">Your profile is stored in Supabase and linked to this browser with a secure identifier. A checkout also stores a separate order snapshot for the merchant.</small>
      </aside>
      <aside className={`cart-drawer ${cartOpen ? "open" : ""}`} aria-hidden={!cartOpen} aria-labelledby="cart-title">
        <div className="cart-heading">
          <div><p className="eyebrow">Your routine</p><h2 id="cart-title">Shopping cart</h2></div>
          <button type="button" className="icon-button" onClick={() => setCartOpen(false)} aria-label="Close cart"><X /></button>
        </div>
        {cartLines.length === 0 ? (
          <div className="empty-cart"><ShoppingBag size={34} /><h3>Your cart is empty</h3><p>Add an essential or ask CartPilot to build a routine.</p></div>
        ) : (
          <>
            <div className="cart-lines">
              {cartLines.map((line) => {
                const item = productByVariant.get(line.variantId);
                if (!item) return null;
                return (
                  <article key={line.variantId}>
                    <div className={`cart-thumb ${productTones[item.product.productType] ?? "mint"}`}>
                      <Image src={productImages[item.product.productType] ?? productImages.Cleanser} alt="" fill sizes="60px" />
                    </div>
                    <div><small>{item.product.productType} · {item.variant.size}</small><h3>{item.product.productName}</h3><strong>{formatInr(item.variant.pricePaise * line.quantity)}</strong></div>
                    <div className="quantity-control">
                      <button type="button" onClick={() => updateQuantity(line.variantId, line.quantity - 1)} aria-label={`Decrease ${item.product.productName}`}><Minus size={14} /></button>
                      <span>{line.quantity}</span>
                      <button type="button" onClick={() => updateQuantity(line.variantId, line.quantity + 1)} aria-label={`Increase ${item.product.productName}`}><Plus size={14} /></button>
                    </div>
                  </article>
                );
              })}
            </div>

            {offerStatus === "loading" && <div className="offer-loading"><Sparkles size={17} /> Checking valid bundles and offers...</div>}
            {offerStatus === "error" && <p className="offer-error">The offer check paused safely. Your cart has not changed.</p>}
            {activeDecision && (
              <div className={`policy-check ${activeDecision.policy.status}`}>
                <ShieldCheck size={18} aria-hidden="true" />
                <span>
                  <strong>{policyPassed ? "Policy checks passed" : "Checkout paused by policy"}</strong>
                  <small>{activeDecision.policy.summary}</small>
                </span>
              </div>
            )}
            {hasAdditionalOffer && offer && (
              <section className="offer-card">
                <span><Sparkles size={16} /> CartPilot found a stronger option</span>
                <h3>{offer.explanation.headline}</h3>
                <p>{offer.explanation.offerReason}</p>
                <div><strong>{formatInr(offer.selected.totalPaise)}</strong>{offer.selected.savingPaise > 0 && <small>Save {formatInr(offer.selected.savingPaise)}</small>}</div>
                <button type="button" onClick={acceptSelectedOffer}>Choose this offer</button>
                <small>You choose. No order has been created.</small>
              </section>
            )}
            {acceptedOffer && (
              <div className="accepted-offer"><Check size={17} /><span><strong>Offer selected</strong><small>Exact total preserved for confirmation.</small></span></div>
            )}

            <div className="cart-total">
              <div><span>Subtotal</span><span>{formatInr(cartSubtotal)}</span></div>
              {acceptedOffer && acceptedOffer.selected.savingPaise > 0 && <div className="saving"><span>Offer saving</span><span>-{formatInr(acceptedOffer.selected.savingPaise)}</span></div>}
              <div className="grand-total"><strong>Total</strong><strong>{formatInr(displayedTotal)}</strong></div>
            </div>
            <label className="checkout-confirmation">
              <input type="checkbox" checked={exactTotalConfirmed} disabled={!policyPassed} onChange={(event) => setExactTotalConfirmed(event.target.checked)} />
              <span>I confirm this exact cart and total of <strong>{formatInr(displayedTotal)}</strong>.</span>
            </label>
            <button className="checkout-button" type="button" onClick={beginTestCheckout} disabled={!activeDecision || !policyPassed || !exactTotalConfirmed || checkoutStatus === "preparing"}>
              {checkoutStatus === "preparing" ? "Preparing Test checkout..." : checkoutStatus === "failure" ? "Retry Razorpay Test Payment" : "Pay with Razorpay Test Mode"} <ArrowRight size={18} />
            </button>
            {checkoutMessage && <p className={`checkout-status ${checkoutStatus}`} role="status">{checkoutMessage}</p>}
            <p className="checkout-note"><ShieldCheck size={15} /> Atomic checkout protection keeps one confirmed cart tied to one Razorpay order. Duplicate clicks and webhook replays cannot create a second fulfilment.</p>
          </>
        )}
      </aside>
    </main>
  );
}

function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Razorpay Checkout could not load.")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Razorpay Checkout could not load.")), { once: true });
    document.head.appendChild(script);
  });
}

function isCompleteProfile(profile: CustomerProfileData): boolean {
  return normalizeCustomerProfile(profile) !== null;
}

function customerProfileData(profile: SavedCustomerProfile): CustomerProfileData {
  return {
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    deliveryAddress: profile.deliveryAddress,
  };
}

function readLegacyProfile(): CustomerProfileData | null {
  try {
    const stored = window.localStorage.getItem(profileStorageKey);
    return stored ? normalizeCustomerProfile(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

function formatCustomerOrderDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function ProductCard({
  product,
  onAdd,
  elementId,
}: {
  product: PublicCatalogProduct;
  onAdd: (variantId: string) => void;
  elementId?: string;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState(
    product.variants.find((variant) => variant.isDefault)?.variantId ?? product.variants[0].variantId,
  );
  const selected = product.variants.find((variant) => variant.variantId === selectedVariantId) ?? product.variants[0];
  const visualVariant = Number.parseInt(product.productId.slice(-1), 10) % 3;

  return (
    <article className="product-card" id={elementId}>
      <div className={`product-visual ${productTones[product.productType] ?? "mint"} visual-${visualVariant}`}>
        <Image
          src={productImages[product.productType] ?? productImages.Cleanser}
          alt={`${product.productName} product packshot`}
          fill
          sizes="(max-width: 650px) 100vw, (max-width: 900px) 50vw, 33vw"
        />
      </div>
      <div className="product-meta"><span>{product.productType}</span><span>{selected.size}</span></div>
      <h3>{product.productName}</h3>
      <p>{product.useCase}</p>
      {product.variants.length > 1 && (
        <label className="variant-select">Size
          <select value={selectedVariantId} onChange={(event) => setSelectedVariantId(event.target.value)}>
            {product.variants.map((variant) => <option key={variant.variantId} value={variant.variantId}>{variant.size} · {formatInr(variant.pricePaise)}</option>)}
          </select>
        </label>
      )}
      <div className="product-footer">
        <strong>{formatInr(selected.pricePaise)}</strong>
        <button type="button" disabled={!selected.inStock} onClick={() => onAdd(selected.variantId)}>{selected.inStock ? "Add to cart" : "Unavailable"}</button>
      </div>
    </article>
  );
}

function productsForConcern(
  products: PublicCatalogProduct[],
  concernKeys: readonly string[],
): PublicCatalogProduct[] {
  return products
    .filter((product) => product.supportedConcerns.some((concern) => concernKeys.includes(concern)))
    .sort((left, right) => {
      const matchDifference = concernMatchCount(right, concernKeys) - concernMatchCount(left, concernKeys);
      if (matchDifference !== 0) return matchDifference;
      const bundleDifference = Number(left.productType === "Bundle") - Number(right.productType === "Bundle");
      if (bundleDifference !== 0) return bundleDifference;
      return left.startingPricePaise - right.startingPricePaise || left.productName.localeCompare(right.productName);
    });
}

function concernMatchCount(product: PublicCatalogProduct, concernKeys: readonly string[]): number {
  return product.supportedConcerns.filter((concern) => concernKeys.includes(concern)).length;
}
