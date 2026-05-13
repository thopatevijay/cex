# Engine Route Edge Cases

> Backend routes call the engine through Redis. Students should test engine behavior using these HTTP routes.
> 

---

## Base Routes

```
POST /order
GET /depth/:symbol
GET /balance
GET /order/:orderId
DELETE /order/:orderId
```

### Required Headers

```
Authorization: Bearer <token>
```

---

# 1. Create Order

- Below is the Edge cases to remember
    
    ## Case 1: Limit Buy Order Does Not Match
    
    ### Existing Order Book
    
    ```
    {
      "asks": [
        {
          "price":200,
          "qty":5
        }
      ]
    }
    ```
    
    ### Request
    
    ```
    {
      "type":"limit",
      "side":"buy",
      "symbol":"BTC",
      "price":100,
      "qty":5
    }
    ```
    
    ### Expected Result
    
    Buy price is lower than best ask, so it should not match.
    
    ```
    {
      "status":"open",
      "filledQty":0,
      "averagePrice":null,
      "fills": []
    }
    ```
    
    ### Depth After
    
    ```
    {
      "bids": [
        {
          "price":100,
          "qty":5
        }
      ],
      "asks": [
        {
          "price":200,
          "qty":5
        }
      ]
    }
    ```
    
    ---
    
    ## Case 2: Limit Buy Order Matches Best Ask
    
    ### Existing Order Book
    
    ```
    {
      "asks": [
        {
          "price":100,
          "qty":5
        }
      ]
    }
    ```
    
    ### Request
    
    ```
    {
      "type":"limit",
      "side":"buy",
      "symbol":"BTC",
      "price":100,
      "qty":5
    }
    ```
    
    ### Expected Result
    
    Buy price is equal to best ask, so it should match.
    
    ```
    {
      "status":"filled",
      "filledQty":5,
      "averagePrice":100
    }
    ```
    
    ---
    
    ## Case 3: Limit Buy Order Has Better Price Than Best Ask
    
    ### Existing Order Book
    
    ```
    {
      "asks": [
        {
          "price":100,
          "qty":5
        }
      ]
    }
    ```
    
    ### Request
    
    ```
    {
      "type":"limit",
      "side":"buy",
      "symbol":"BTC",
      "price":200,
      "qty":5
    }
    ```
    
    ### Expected Result
    
    The user is willing to buy up to `200`, but the best available ask is `100`.
    
    The trade should happen at the **resting order price**:
    
    ```
    100
    ```
    
    ### Expected Response
    
    ```
    {
      "status":"filled",
      "filledQty":5,
      "averagePrice":100
    }
    ```
    
    > Important: Do not fill at `200`. Fill at the best available ask price.
    > 
    
    ---
    
    ## Case 4: Limit Sell Order Does Not Match
    
    ### Existing Order Book
    
    ```
    {
      "bids": [
        {
          "price":100,
          "qty":5
        }
      ]
    }
    ```
    
    ### Request
    
    ```
    {
      "type":"limit",
      "side":"sell",
      "symbol":"BTC",
      "price":200,
      "qty":5
    }
    ```
    
    ### Expected Result
    
    Sell price is higher than best bid, so it should not match.
    
    ```
    {
      "status":"open",
      "filledQty":0,
      "averagePrice":null,
      "fills": []
    }
    ```
    
    ---
    
    ## Case 5: Limit Sell Order Has Better Price Than Best Bid
    
    ### Existing Order Book
    
    ```
    {
      "bids": [
        {
          "price":200,
          "qty":5
        }
      ]
    }
    ```
    
    ### Request
    
    ```
    {
      "type":"limit",
      "side":"sell",
      "symbol":"BTC",
      "price":100,
      "qty":5
    }
    ```
    
    ### Expected Result
    
    The seller is willing to sell for `100`, but the best buyer is already bidding `200`.
    
    The trade should happen at the **resting order price**:
    
    ```
    200
    ```
    
    ### Expected Response
    
    ```
    {
      "status":"filled",
      "filledQty":5,
      "averagePrice":200
    }
    ```
    
    > Important: Do not fill at `100`. Fill at the best available bid price.
    > 
    
    ---
    
    ## Case 6: Partial Fill For Limit Order
    
    ### Existing Order Book
    
    ```
    {
      "asks": [
        {
          "price":100,
          "qty":3
        }
      ]
    }
    ```
    
    ### Request
    
    ```
    {
      "type":"limit",
      "side":"buy",
      "symbol":"BTC",
      "price":100,
      "qty":10
    }
    ```
    
    ### Expected Result
    
    Only `3 BTC` is available to buy.
    
    ```
    {
      "status":"partially_filled",
      "filledQty":3,
      "averagePrice":100
    }
    ```
    
    ### Depth After
    
    Remaining `7` quantity should rest on bids.
    
    ```
    {
      "bids": [
        {
          "price":100,
          "qty":7
        }
      ],
      "asks": []
    }
    ```
    
    ---
    
    ## Case 7: Match Multiple Price Levels
    
    ### Existing Order Book
    
    ```
    {
      "asks": [
        {
          "price":100,
          "qty":2
        },
        {
          "price":110,
          "qty":3
        },
        {
          "price":120,
          "qty":5
        }
      ]
    }
    ```
    
    ### Request
    
    ```
    {
      "type":"limit",
      "side":"buy",
      "symbol":"BTC",
      "price":120,
      "qty":10
    }
    ```
    
    ### Expected Result
    
    The engine should match cheapest asks first:
    
    - `2 qty` at `100`
    - `3 qty` at `110`
    - `5 qty` at `120`
    
    ### Expected Response
    
    ```
    {
      "status":"filled",
      "filledQty":10,
      "averagePrice":114
    }
    ```
    
    ### Average Price Calculation
    
    ```
    ((2 * 100) + (3 * 110) + (5 * 120)) / 10 = 114
    ```
    
    ---
    
    ## Case 8: Limit Buy Should Not Cross Above Allowed Price
    
    ### Existing Order Book
    
    ```
    {
      "asks": [
        {
          "price":100,
          "qty":2
        },
        {
          "price":110,
          "qty":3
        },
        {
          "price":130,
          "qty":5
        }
      ]
    }
    ```
    
    ### Request
    
    ```
    {
      "type":"limit",
      "side":"buy",
      "symbol":"BTC",
      "price":110,
      "qty":10
    }
    ```
    
    ### Expected Result
    
    The order can match `100` and `110`, but not `130`.
    
    ```
    {
      "status":"partially_filled",
      "filledQty":5,
      "averagePrice":106
    }
    ```
    
    ### Depth After
    
    Remaining `5` should rest as bid at `110`.
    
    ```
    {
      "bids": [
        {
          "price":110,
          "qty":5
        }
      ],
      "asks": [
        {
          "price":130,
          "qty":5
        }
      ]
    }
    ```
    
    ---
    
    ## Case 9: Market Buy Fully Filled
    
    ### Existing Order Book
    
    ```
    {
      "asks": [
        {
          "price":100,
          "qty":5
        }
      ]
    }
    ```
    
    ### Request
    
    ```
    {
      "type":"market",
      "side":"buy",
      "symbol":"BTC",
      "qty":5
    }
    ```
    
    ### Expected Result
    
    ```
    {
      "status":"filled",
      "filledQty":5,
      "averagePrice":100
    }
    ```
    
    > Market orders should use best available prices.
    > 
    
    ---
    
    ## Case 10: Market Buy Partially Filled
    
    ### Existing Order Book
    
    ```
    {
      "asks": [
        {
          "price":100,
          "qty":2
        }
      ]
    }
    ```
    
    ### Request
    
    ```
    {
      "type":"market",
      "side":"buy",
      "symbol":"BTC",
      "qty":5
    }
    ```
    
    ### Expected Result
    
    Only `2 BTC` is available.
    
    ```
    {
      "status":"partially_filled",
      "filledQty":2,
      "averagePrice":100
    }
    ```
    
    > Market orders should not rest on the book.
    > 
    
    ---
    
    ## Case 11: Market Order With Empty Book
    
    ### Existing Order Book
    
    ```
    {
      "bids": [],
      "asks": []
    }
    ```
    
    ### Request
    
    ```
    {
      "type":"market",
      "side":"buy",
      "symbol":"BTC",
      "qty":5
    }
    ```
    
    ### Expected Result
    
    No matching order exists.
    
    ```
    {
      "status":"cancelled",
      "filledQty":0,
      "averagePrice":null,
      "fills": []
    }
    ```
    
    ---
    
    ## Case 12: Price-Time Priority
    
    ### Existing Orders
    
    ### First Sell Order
    
    ```
    {
      "type":"limit",
      "side":"sell",
      "symbol":"BTC",
      "price":100,
      "qty":5
    }
    ```
    
    ### Second Sell Order
    
    ```
    {
      "type":"limit",
      "side":"sell",
      "symbol":"BTC",
      "price":100,
      "qty":5
    }
    ```
    
    ### New Buy Request
    
    ```
    {
      "type":"limit",
      "side":"buy",
      "symbol":"BTC",
      "price":100,
      "qty":5
    }
    ```
    
    ### **Expected Result**
    
    The first sell order should be filled before the second sell order.
    
    Orders at the same price must match in FIFO order.
    

# 2. Get Depth

- Below is cases to remember in depth
    
    ## Route
    
    ```
    GET /depth/:symbol
    ```
    
    ---
    
    ## Case 1: Empty Order Book
    
    ### Request
    
    ```
    GET /depth/BTC
    ```
    
    ### Expected Result
    
    ```
    {
      "symbol":"BTC",
      "bids": [],
      "asks": []
    }
    ```
    
    ---
    
    ## Case 2: Bids Sorted Highest First
    
    ### Existing Bids
    
    ```
    [
      {
        "price":100,
        "qty":5
      },
      {
        "price":120,
        "qty":3
      },
      {
        "price":90,
        "qty":2
      }
    ]
    ```
    
    ### Expected Depth
    
    ```
    {
      "bids": [
        {
          "price":120,
          "qty":3
        },
        {
          "price":100,
          "qty":5
        },
        {
          "price":90,
          "qty":2
        }
      ]
    }
    ```
    
    > Bids should always be sorted from highest price to lowest price.
    > 
    
    ---
    
    ## Case 3: Asks Sorted Lowest First
    
    ### Existing Asks
    
    ```
    [
      {
        "price":120,
        "qty":3
      },
      {
        "price":100,
        "qty":5
      },
      {
        "price":90,
        "qty":2
      }
    ]
    ```
    
    ### Expected Depth
    
    ```
    {
      "asks": [
        {
          "price":90,
          "qty":2
        },
        {
          "price":100,
          "qty":5
        },
        {
          "price":120,
          "qty":3
        }
      ]
    }
    ```
    
    > Asks should always be sorted from lowest price to highest price.
    > 
    
    ---
    
    ## Case 4: Same Price Orders Should Be Grouped
    
    ### Existing Bids
    
    ```
    [
      {
        "price":100,
        "qty":5
      },
      {
        "price":100,
        "qty":3
      }
    ]
    ```
    
    ### Expected Depth
    
    ```
    {
      "bids": [
        {
          "price":100,
          "qty":8
        }
      ]
    }
    ```
    
    > Orders at the same price level should be aggregated into a single depth level.
    > 
    
    ---
    
    ## Case 5: Filled Orders Should Not Appear
    
    ### Expected Behavior
    
    If an order is fully filled, it should be removed from depth.
    
    ### Expected Depth
    
    ```
    {
      "bids": [],
      "asks": []
    }
    ```
    
    ---
    
    ## Case 6: Cancelled Orders Should Not Appear
    
    ### Expected Behavior
    
    If an order is cancelled, its remaining quantity should be removed from depth.
    
    ### Expected Depth
    
    ```
    {
      "bids": [],
      "asks": []
    }
    ```
    

## 3. Get Balance

- Belpw are cases
    
    ## Route
    
    ```
    GET /balance
    ```
    
    ---
    
    ## Case 1: New User Balance
    
    ### Expected Result
    
    ```
    {
      "USD": {
        "available":1000000,
        "locked":0
      },
      "BTC": {
        "available":1000,
        "locked":0
      }
    }
    ```
    
    > A newly created user should start with the default balances.
    > 
    
    ---
    
    ## Case 2: Buyer Balance After Fill
    
    ### Trade
    
    Buyer buys `5 BTC` at `100`.
    
    ### Expected Buyer Balance Change
    
    - `USD` decreases by `500`
    - `BTC` increases by `5`
    
    ### Example Balance Update
    
    ### Before Trade
    
    ```
    {
      "USD": {
        "available":1000000
      },
      "BTC": {
        "available":1000
      }
    }
    ```
    
    ### After Trade
    
    ```
    {
      "USD": {
        "available":999500
      },
      "BTC": {
        "available":1005
      }
    }
    ```
    
    ---
    
    ## Case 3: Seller Balance After Fill
    
    ### Trade
    
    Seller sells `5 BTC` at `100`.
    
    ### Expected Seller Balance Change
    
    - `BTC` decreases by `5`
    - `USD` increases by `500`
    
    ### Example Balance Update
    
    ### Before Trade
    
    ```
    {
      "USD": {
        "available":1000000
      },
      "BTC": {
        "available":1000
      }
    }
    ```
    
    ### After Trade
    
    ```
    {
      "USD": {
        "available":1000500
      },
      "BTC": {
        "available":995
      }
    }
    ```
    
    ---
    
    ## Case 4: Open Order Should Not Change Balance Unless Locking Is Implemented
    
    ### Expected Behavior
    
    If the engine does **not** implement locked balances, placing an open limit order should not change balance.
    
    ---
    
    ### If Locking Is Implemented
    
    ### Buy Order
    
    A buy order should lock `USD`.
    
    ### Example
    
    ```
    {
      "USD": {
        "available":999500,
        "locked":500
      }
    }
    ```
    
    ---
    
    ### Sell Order
    
    A sell order should lock `BTC`.
    
    ### Example
    
    ```
    {
      "BTC": {
        "available":995,
        "locked":5
      }
    }
    ```
    
    ---
    
    ### Cancel Order
    
    Cancelling an order should unlock the remaining locked amount.
    
    ### Example
    
    ```
    {
      "USD": {
        "available":1000000,
        "locked":0
      }
    }
    ```
    

# 4. Get Order

- Below is edge case for get order
    
    ## Route
    
    ```
    GET /order/:orderId
    ```
    
    ---
    
    ## Case 1: Open Order
    
    ### Expected Result
    
    ```
    {
      "orderId":"<order-id>",
      "side":"buy",
      "type":"limit",
      "symbol":"BTC",
      "price":100,
      "qty":5,
      "filledQty":0,
      "status":"open",
      "fills": []
    }
    ```
    
    > Open orders should remain visible until fully filled or cancelled.
    > 
    
    ---
    
    ## Case 2: Partially Filled Order
    
    ### Expected Result
    
    ```
    {
      "orderId":"<order-id>",
      "side":"buy",
      "type":"limit",
      "symbol":"BTC",
      "price":100,
      "qty":10,
      "filledQty":4,
      "status":"partially_filled",
      "fills": []
    }
    ```
    
    > `filledQty` should reflect only the executed quantity.
    > 
    
    ---
    
    ## Case 3: Filled Order
    
    ### Expected Result
    
    ```
    {
      "orderId":"<order-id>",
      "status":"filled",
      "filledQty":10,
      "fills": []
    }
    ```
    
    > Fully matched orders should return `status: "filled"`.
    > 
    
    ---
    
    ## Case 4: Unknown Order
    
    ### Expected Result
    
    ```
    {
      "error":"order not found"
    }
    ```
    
    > The engine should return an error for non-existent orders.
    > 
    
    ---
    
    ## Case 5: User Tries To Read Another User’s Order
    
    ### Expected Result
    
    ```
    {
      "error":"order not found"
    }
    ```
    
    > The engine should not expose orders owned by another user.
    > 

# 5. Cancel Order

- Below are the edge cases for the cancel order
    
    ## Route
    
    ```
    DELETE /order/:orderId
    ```
    
    ---
    
    ## Case 1: Cancel Open Limit Order
    
    ### Existing Order
    
    ```
    {
      "status":"open",
      "qty":10,
      "filledQty":0
    }
    ```
    
    ### Expected Result
    
    ```
    {
      "status":"cancelled",
      "qty":10,
      "filledQty":0
    }
    ```
    
    > The order should be removed from depth.
    > 
    
    ---
    
    ## Case 2: Cancel Partially Filled Limit Order
    
    ### Existing Order
    
    ```
    {
      "status":"partially_filled",
      "qty":10,
      "filledQty":4
    }
    ```
    
    ### Expected Result
    
    ```
    {
      "status":"cancelled",
      "qty":10,
      "filledQty":4
    }
    ```
    
    > Only the remaining `6` quantity should be removed from depth.
    > 
    
    ---
    
    ## Case 3: Cancel Filled Order
    
    ### Existing Order
    
    ```
    {
      "status":"filled"
    }
    ```
    
    ### Expected Result
    
    ```
    {
      "error":"filled orders cannot be cancelled"
    }
    ```
    
    > Filled orders are final and should not be cancellable.
    > 
    
    ---
    
    ## Case 4: Cancel Already Cancelled Order
    
    ### Existing Order
    
    ```
    {
      "status":"cancelled"
    }
    ```
    
    ### Expected Result
    
    ```
    {
      "error":"order already cancelled"
    }
    ```
    
    > Cancelling the same order multiple times should return an error.
    > 
    
    ---
    
    ## Case 5: Cancel Unknown Order
    
    ### Expected Result
    
    ```
    {
      "error":"order not found"
    }
    ```
    
    > The engine should return an error for unknown order IDs.
    > 
    
    ---
    
    ## Case 6: User Tries To Cancel Another User’s Order
    
    ### Expected Result
    
    ```
    {
      "error":"order not found"
    }
    ```
    
    > The engine should not allow one user to cancel another user’s order.
    >