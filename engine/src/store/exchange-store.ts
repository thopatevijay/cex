import {randomUUID} from "crypto";

const QUOTE = "USD";
const SEED_QUOTE = 1_000_000;
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
export function ensureBalances(userId: string, symbol: string): void {
  if (!BALANCES.has(userId)) BALANCES.set(userId, {});
  const userBalances = BALANCES.get(userId)!;

  if (!userBalances[QUOTE]) {
    userBalances[QUOTE] = { available: SEED_QUOTE, locked: 0 };
  }

  if (!userBalances[symbol]) {
    userBalances[symbol] = { available: SEED_BASE, locked: 0 };
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

function restOnBook(order: OrderRecord, book: OrderBook): void {
  const resting: RestingOrder = {
    orderId: order.orderId,
    userId: order.userId,
    side: order.side,
    type: "limit",
    symbol: order.symbol,
    price: order.price!,
    qty: order.qty,
    filledQty: order.filledQty,
    status: order.status,
    createdAt: order.createdAt,
  }

  const levels = order.side === "buy" ? book.bids : book.asks;
  const queue = levels.get(resting.price) ?? [];
  queue.push(resting);
  levels.set(resting.price, queue);
}

export function getOrCreateOrderBook(symbol: string): OrderBook {
  let book = ORDERBOOKS.get(symbol);

  if(!book) {
    book = { bids: new Map(), asks: new Map()};
    ORDERBOOKS.set(symbol, book);
  }

  return book;
}

export function placeLimitOrder(input: CreateOrderInput): OrderRecord {
  const { userId, qty, side, symbol} = input;
  const price = input.price!;

  ensureBalances(userId, symbol);

  if(side === "buy") {
    lockBalance(userId, QUOTE, price * qty);
  } else {
    lockBalance(userId, symbol, qty)
  }

  const book = getOrCreateOrderBook(symbol);

  const order: OrderRecord = {
    orderId: randomUUID(),
    userId,
    side,
    type: "limit",
    symbol,
    price,
    qty,
    filledQty: 0,
    status: "open",
    fills: [],
    createdAt: Date.now(),
  };

  const oppositePrices = side === "buy"
    ? [...book.asks.keys()].sort((a,b) => a - b)
    : [...book.bids.keys()].sort((a,b) => b - a);

  outer: for (const lvlPrice of oppositePrices) {
    if (side === "buy" && price < lvlPrice) break;
    if (side === "sell" && price > lvlPrice) break;

    const levels = side === "buy" ? book.asks : book.bids;
    const level = levels.get(lvlPrice)!;

    while(level.length > 0) {
      const maker = level[0];
      const makerRm = maker.qty - maker.filledQty;
      const takerRm = order.qty - order.filledQty;
      const tradeQty = Math.min(makerRm, takerRm);
      const tradePrice = maker.price;
      

      const fill: Fill = {
        fillId: randomUUID(),
        symbol,
        price: tradePrice,
        qty: tradeQty,
        buyOrderId: side === "buy" ? order.orderId : maker.orderId,
        sellOrderId: side === "sell" ? order.orderId : maker.orderId,
        createdAt: Date.now(),
      };

      order.filledQty += tradeQty;
      order.fills.push(fill);
      maker.filledQty += tradeQty;

      let makerRecord = ORDERS.get(maker.orderId)!;
      makerRecord.filledQty += tradeQty;
      makerRecord.fills.push(fill);

      const buyerId = side === "buy" ? order.userId : maker.userId;
      const sellerId = side === "sell" ? order.userId : maker.userId;
      settleFill(fill, buyerId, sellerId, symbol);

      FILLS.push(fill);

      if (maker.filledQty === maker.qty) {
        maker.status = "filled";
        makerRecord.status = "filled";
        level.shift();
      }

      if(order.filledQty === order.qty) {
        order.status = "filled";
        break outer;
      }
    }

    if(level.length === 0) {
      (side === "buy" ? book.asks : book.bids).delete(lvlPrice);
    }
  }

  if (order.filledQty === 0) {
    order.status = "open";
    restOnBook(order, book);
  } else if (order.filledQty < order.qty) {
    order.status = "partially_filled";
    restOnBook(order, book);
  }

  ORDERS.set(order.orderId, order);
  return order;
}

export function getDepth(symbol: string) : DepthResponse {
  const book = ORDERBOOKS.get(symbol);

  if(!book) return {symbol,  bids : [], asks: []};

  const aggregate = (
    levels: Map<number, RestingOrder[]>,
    desc: boolean,
  ): DepthLevel[] => {

    const result: DepthLevel[] = [];
    for (const [price, orders] of levels) {
      const remaining = orders.reduce(
        (sum, o) => sum + (o.qty - o.filledQty), 0,
      );
      if (remaining > 0) result.push({ price, qty: remaining});
    } 
    result.sort((a,b) => (desc ? b.price - a.price : a.price - b.price));
    return result;
  };

  return {
    symbol,
    bids: aggregate(book.bids, true),
    asks: aggregate(book.asks, false),
  };
}

export function getOrder(orderId: string, userId: string): OrderRecord | undefined {
  const order = ORDERS.get(orderId);
  if(!order) return undefined

  if(order.userId !== userId) return undefined;

  return order;
};

export function cancelOrder(
  orderId: string,
  userId: string,
): {ok: boolean, error?: string, order?: OrderRecord}  {

  const order = ORDERS.get(orderId);
  if(!order) {
    return { ok: false, error: "order not found"};
  }

  if(order.userId !== userId) {
    return {ok: false, error: "order not found"};
  }

  if(order.status === "filled") {
    return { ok: false, error: "filled orders cannot be cancelled" };
  }

  if(order.status == "cancelled") {
    return { ok : false, error : "order already cancelled"};
  }

  const book = ORDERBOOKS.get(order.symbol);
  console.log(book);

  //remove from book
  if( book && order.price !== null) {
    const levels = order.side === "buy" ? book.bids : book.asks;
    const queue = levels.get(order.price);
    if(queue) {
      const idx = queue.findIndex((o) => o.orderId === orderId);
      if(idx !== -1) queue.splice(idx, 1);
      if(queue.length === 0) levels.delete(order.price);
    }
  }

  //refund
  const unfilled = order.qty - order.filledQty;
  if(unfilled > 0) {
    if(order.side === "buy") {
      const refund = order.price! * unfilled;
      const bal = BALANCES.get(order.userId)![QUOTE];
      bal.locked -= refund;
      bal.available += refund;
    } else {
      const bal = BALANCES.get(order.userId)![order.symbol];
      bal.locked -= unfilled;
      bal.available += unfilled;
    }
  }

  order.status = "cancelled";
  return { ok : true, order};
};

export function placeMarketOrder(input: CreateOrderInput): OrderRecord {
  const { userId, symbol, qty, side } = input;
  ensureBalances(userId, symbol);

const book = getOrCreateOrderBook(symbol);

let lockedQuote = 0;
if(side === "buy") {
  lockedQuote = BALANCES.get(userId)![QUOTE].available;
  lockBalance(userId, QUOTE, lockedQuote);
} else {
  lockBalance(userId, symbol, qty);
}

const order: OrderRecord = {
  orderId: randomUUID(),
  userId,
  side,
  type: "market",
  symbol,
  price: null,
  qty,
  filledQty: 0,
  status: "open",
  fills:[],
  createdAt: Date.now(),
};

  const oppositePrices = side === "buy"
    ? [...book.asks.keys()].sort((a,b) => a - b)
    : [...book.bids.keys()].sort((a,b) => b - a);


  outer: for (const lvlPrice of oppositePrices) {
    const levels = side === "buy" ? book.asks : book.bids;
    const level = levels.get(lvlPrice);

    while(level.length > 0) {
      const maker = level[0];
      const marketRem = maker.qty - maker.filledQty;
      const takerRem = order.qty - order.filledQty;
      const tradeQty = Math.min(marketRem, takerRem);
      const tradePrice = maker?.price;

      const fill: Fill = {
        fillId: randomUUID(),
        symbol,
        price: tradePrice,
        qty: tradeQty,
        buyOrderId: side === "buy" ? order.orderId : maker.orderId,
        sellOrderId: side === "sell" ? order.orderId : maker.orderId,
        createdAt: Date.now(),
      };

      order.filledQty += tradeQty;
      order.fills.push(fill);
      maker.filledQty += tradeQty;
      const makerRecord = ORDERS.get(maker.orderId)!;
      makerRecord.filledQty += tradeQty;
      makerRecord.fills.push(fill);

      const buyerId = side === "buy" ? order.userId : maker.userId;
      const sellerId = side === "sell" ? order.userId : order.userId;
      settleFill(fill, buyerId, sellerId, symbol);

      FILLS.push(fill);

      if ( maker.filledQty === maker.qty) {
        maker.status = "filled";
        makerRecord.status = "filled";
        level.shift();
      }

      if(order.filledQty === order.qty) {
        order.status === "filled";
        break outer;
      }
    }

    if(level?.length === 0) {
      (side === "buy" ? book.asks : book.bids).delete(lvlPrice);
    }
  }

  if(order.filledQty === order.qty) order.status = "filled";
  else if (order.filledQty > 0) order.status = "partially_filled";
  else order.status === "cancelled";

  if (side === "buy") {
    const spent = order.fills.reduce((s,f) => s + f.price * f.qty, 0);
    const refund = lockedQuote - spent;
    if(refund > 0 ) {
      const bal = BALANCES.get(userId)![QUOTE];
      bal.locked -= refund;
      bal.available += refund;
    }
  } else {
    const unfilled = order.qty - order.filledQty;
    if( unfilled > 0) {
      const bal = BALANCES.get(userId)![symbol];
      bal.locked -= unfilled;
      bal.available += unfilled;
    }
  }

  ORDERS.set(order.orderId, order);
  return order;
}