'use client'

import { useState } from 'react'
import { ContainerCard } from '@/components/container-card'
import { CtaButton } from '@/components/cta-button'
import { FadeUp } from '@/components/fade-up'
import { Calculator, CheckCircle, Clock, DollarSign, TrendingUp } from 'lucide-react'

export function RoiCalculator() {
  const [weeklyQuotes, setWeeklyQuotes] = useState(30)

  // Calculations
  const monthlyQuotes = Math.round(weeklyQuotes * 4.33)
  // ~2 hours saved per quote
  const hoursSavedMonthly = Math.round(monthlyQuotes * 2.0)
  // ~8% higher win rate when replying in <30 min
  const extraShipmentsWon = Math.max(1, Math.round(monthlyQuotes * 0.07))
  // Estimated average forwarder margin per shipment: $350
  const estimatedRevenueGain = extraShipmentsWon * 350

  // Plan recommendation
  const recommendedPlan =
    monthlyQuotes <= 75
      ? { name: 'Starter', price: 179 }
      : monthlyQuotes <= 250
      ? { name: 'Growth', price: 399 }
      : { name: 'Business', price: 799 }

  const estimatedRoiMultiple = Math.round(
    estimatedRevenueGain / recommendedPlan.price
  )

  return (
    <section id="calculator" className="bg-white py-24 border-b border-gray-100">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeUp className="text-center max-w-3xl mx-auto">
          <span className="font-stencil text-xs font-bold text-[#F97316] tracking-widest uppercase">
            OPERATIONAL ROI CALCULATOR
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-black text-[#0D1B2A]">
            How Much Time & Profit Is Your Desk Losing to Manual Quoting?
          </h2>
          <p className="mt-4 text-base sm:text-lg text-gray-600">
            Calculate the exact hours reclaimed and additional shipments won with automated rate collection.
          </p>
        </FadeUp>

        <div className="mt-14 max-w-4xl mx-auto">
          <ContainerCard
            bolts="navy"
            serial="ROI-ESTIMATOR-45G"
            className="border-2 border-[#0D1B2A] bg-[#FFFBF7] p-6 sm:p-10 shadow-xl"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left Column: Interactive Slider */}
              <div className="lg:col-span-6 space-y-6">
                <div>
                  <div className="flex justify-between items-center text-sm font-bold text-[#0D1B2A]">
                    <span>Weekly Quote Requests:</span>
                    <span className="rounded-full bg-[#F97316] px-3.5 py-1 text-white font-mono text-base">
                      {weeklyQuotes} quotes / week
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={150}
                    step={5}
                    value={weeklyQuotes}
                    onChange={(e) => setWeeklyQuotes(Number(e.target.value))}
                    className="mt-4 w-full accent-[#F97316] h-2 bg-gray-200 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1 font-mono">
                    <span>10 / wk (Small Desk)</span>
                    <span>75 / wk (Mid)</span>
                    <span>150+ / wk (High Volume)</span>
                  </div>
                </div>

                <div className="rounded-lg bg-white p-4 border border-gray-200/80 shadow-2xs space-y-2 text-xs text-gray-600">
                  <div className="flex justify-between items-center">
                    <span>Estimated Monthly Volume:</span>
                    <strong className="font-mono text-gray-900 text-sm">~{monthlyQuotes} quotes/mo</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Recommended Tier:</span>
                    <strong className="text-[#F97316] font-bold text-sm">
                      {recommendedPlan.name} (${recommendedPlan.price}/mo)
                    </strong>
                  </div>
                </div>

                <div className="pt-2">
                  <CtaButton fullWidth size="lg">
                    Start 2-Week Free Pilot
                  </CtaButton>
                  <p className="mt-2 text-center text-[11px] text-gray-400">
                    No credit card required · Connects with your real carriers in 3 days
                  </p>
                </div>
              </div>

              {/* Right Column: Dynamic Results Grid */}
              <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Hours Saved */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
                  <div className="flex items-center gap-2 text-orange-600">
                    <Clock size={20} />
                    <span className="text-xs font-bold uppercase tracking-wider">Hours Saved</span>
                  </div>
                  <div className="mt-3 text-3xl font-black text-[#0D1B2A]">
                    {hoursSavedMonthly} <span className="text-sm font-normal text-gray-500">hrs/mo</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Desk time redirected from copying rates to customer relations.
                  </p>
                </div>

                {/* Extra Shipments Won */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
                  <div className="flex items-center gap-2 text-emerald-600">
                    <TrendingUp size={20} />
                    <span className="text-xs font-bold uppercase tracking-wider">Extra Shipments</span>
                  </div>
                  <div className="mt-3 text-3xl font-black text-emerald-700">
                    +{extraShipmentsWon} <span className="text-sm font-normal text-gray-500">won/mo</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    From quoting in &lt;30 minutes while shipper intent is peak.
                  </p>
                </div>

                {/* Additional Gross Margin */}
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-600">
                      <DollarSign size={20} />
                      <span className="text-xs font-bold uppercase tracking-wider">Monthly Profit Boost</span>
                    </div>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-[11px] text-emerald-800">
                      {estimatedRoiMultiple}X ROI MULTIPLE
                    </span>
                  </div>
                  <div className="mt-2 text-3xl font-black text-emerald-600">
                    +${estimatedRevenueGain.toLocaleString()} <span className="text-sm font-normal text-gray-500">est. gross profit/mo</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Based on standard MENA forwarder margins ($350/shipment) against the ${recommendedPlan.price}/mo platform cost.
                  </p>
                </div>
              </div>
            </div>
          </ContainerCard>
        </div>
      </div>
    </section>
  )
}
