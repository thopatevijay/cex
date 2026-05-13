

const QUOTE = "USD";
const SEED_QUOTE = 1_000_00;
const SEED_BASE = 1_000;

export type Side = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "open" | "partially_filled" | "filled" | "cancelled";

export interface Balance {
  available: number;
  locked: number;
}

export interface RestingOrder {
  orderId: string;
  userId: string;
  side: Side;
  type: "limit";
  symbol: string;
  price: number;
  qty: number;
  filledQty: number;
  status: OrderStatus;
  createdAt: number;
}

export interface OrderRecord {
  orderId: string;
  userId: string;
  side: Side;
  type: OrderType;
  symbol: string;
  price: number | null;
  qty: number;
  filledQty: number;
  status: OrderStatus;
  fills: Fill[];
  createdAt: number;
}

export interface Fill {
  fillId: string;
  symbol: string;
  price: number;
  qty: number;
  buyOrderId: string;
  sellOrderId: string;
  createdAt: number;
}

export interface OrderBook {
  bids: Map<number, RestingOrder[]>;
  asks: Map<number, RestingOrder[]>;
}

export interface CreateOrderInput {
  userId: string;
  type: OrderType;
  side: Side;
  symbol: string;
  price: number | null;
  qty: number;
}

export interface DepthLevel {
  price: number;
  qty: number;
}

export interface DepthResponse {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

export const BALANCES = new Map<string, Record<string, Balance>>();
export const ORDERBOOKS = new Map<string, OrderBook>();
export const ORDERS = new Map<string, OrderRecord>();
export const FILLS: Fill[] = [];

// balances
export function ensureBalances(userId: string, symbol: string) : void {

  const userBalances = BALANCES.get(userId)!;

  if(!userBalances[QUOTE]) {
    userBalances[QUOTE] = { available : SEED_QUOTE, locked: 0 };
  }

  if(userBalances[symbol]) {
    userBalances[symbol] = { available: SEED_BASE, locked: 0};
  }
}

export function getUserBalance(userId: string): Record<string, Balance> {
  return BALANCES.get(userId) ?? {};
}

export function lockBalance(userId: string, asset: string, amount: number): void {
  const bal = BALANCES.get(userId)![asset];

  if(bal.available < amount ) {
    throw new Error(`insufficient ${asset} balance`);
  }

  bal.available -= amount;
  bal.locked += amount;
}

function consumeLocked(userId: string, asset: string, amount: number): void {
  BALANCES.get(userId)![asset].locked -= amount;
}

function credit(userId: string, asset: string, amount: number): void {
  BALANCES.get(userId)![asset].available += amount;
}

function settleFill(
  fill: Fill,
  buyerId: string,
  sellerId: string,
  symbol: string,
): void {
  
  const quoteAmount = fill.price * fill.qty;
  
  consumeLocked(buyerId, QUOTE, quoteAmount);
  credit(buyerId, symbol, fill.qty);

  consumeLocked(sellerId, symbol, fill.qty);
  credit(sellerId, QUOTE, quoteAmount);
}
