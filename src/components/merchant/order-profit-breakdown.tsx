import type { MerchantOrderProfit, MerchantPaymentStatus } from "@/domain/orders/merchant-order";

const money = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function OrderProfitBreakdown({ profit, paymentStatus }: {
  profit: MerchantOrderProfit | null;
  paymentStatus: MerchantPaymentStatus;
}) {
  const costs: [string, number][] = profit ? [
    ["Product cost", profit.productCostPaise],
    ["Packaging", profit.packagingCostPaise],
    ["Fulfilment", profit.fulfilmentCostPaise],
    ["Expected return cost", profit.expectedReturnCostPaise],
    ["Estimated payment fee", profit.estimatedPaymentCostPaise],
    ...(profit.incentiveCostPaise > 0 ? [["Incentive cost", profit.incentiveCostPaise] as [string, number]] : []),
  ] : [];
  return (
    <section className="order-products order-profit">
      <div className="order-subheading"><h4>Order profit breakdown</h4></div>
      {profit ? <>
        <p>Estimate for the customer-confirmed cart using the demo costs saved at checkout.</p>
        {paymentStatus !== "paid" && <p>Payment has not been captured. This is a potential profit estimate, not earned profit.</p>}
        <dl className="order-profit-rows">
          {profit.discountCostPaise > 0 && <>
            <div><dt>Gross selling price</dt><dd>{money.format(profit.grossItemRevenuePaise / 100)}</dd></div>
            <div><dt>− Offer savings</dt><dd>{money.format(profit.discountCostPaise / 100)}</dd></div>
          </>}
          <div><dt>Selling price{profit.discountCostPaise > 0 ? " after savings" : ""}</dt><dd>{money.format(profit.netRevenuePaise / 100)}</dd></div>
          {costs.map(([label, value]) => <div key={label}><dt>− {label}</dt><dd>{money.format(value / 100)}</dd></div>)}
          <div className="order-profit-total"><dt>Estimated contribution profit</dt><dd>{money.format(profit.contributionProfitPaise / 100)}</dd></div>
        </dl>
      </> : <p>Profit breakdown unavailable: this order does not have a complete matching cost snapshot.</p>}
    </section>
  );
}
