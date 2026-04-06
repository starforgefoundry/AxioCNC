import { useTranslation } from 'react-i18next'
import type { PanelProps } from '../../Setup/types'

// Axis color mapping for distance display
const AXIS_COLORS: Record<string, string> = {
  X: 'text-red-500',
  Y: 'text-green-500',
  Z: 'text-blue-500',
  A: 'text-orange-500',
  B: 'text-purple-500',
  C: 'text-cyan-500',
}

export function CurrentStatsPanel(props: PanelProps) {
  const { t } = useTranslation()
  const stats = props.senderState?.stats
  const availableAxes = props.availableAxes || ['x', 'y', 'z']

  // Get distances from stats
  const totalDistance = stats?.totalDistance || { x: 0, y: 0, z: 0, total: 0 }
  const cuttingDistance = stats?.cuttingDistance || { x: 0, y: 0, z: 0, total: 0 }
  const transitionDistance = stats?.transitionDistance || { x: 0, y: 0, z: 0, total: 0 }

  // Calculate operation type breakdown (for pie chart)
  const totalDistanceTotal = totalDistance.total || 1 // Avoid division by zero
  const cuttingPercent = totalDistanceTotal > 0 ? (cuttingDistance.total / totalDistanceTotal) * 100 : 0
  const transitionPercent = totalDistanceTotal > 0 ? (transitionDistance.total / totalDistanceTotal) * 100 : 0
  const retractPercent = 100 - cuttingPercent - transitionPercent

  const operationTypes = [
    { type: t('Cutting'), percent: cuttingPercent, color: 'rgb(59 130 246)', bgColor: 'bg-blue-500', distance: cuttingDistance.total },
    { type: t('Transition'), percent: transitionPercent, color: 'rgb(34 197 94)', bgColor: 'bg-green-500', distance: transitionDistance.total },
    { type: t('Retract'), percent: retractPercent > 0 ? retractPercent : 0, color: 'rgb(249 115 22)', bgColor: 'bg-orange-500', distance: (totalDistance.total || 0) - cuttingDistance.total - transitionDistance.total },
  ].filter(op => op.percent > 0) // Only show operations with distance

  // Build per-axis distance data dynamically
  const axisDistances = availableAxes.map(a => {
    const dist = (totalDistance as Record<string, number>)[a] || 0
    const upper = a.toUpperCase()
    const isRotary = a === 'a' || a === 'b' || a === 'c'
    return { axis: upper, distance: dist, unit: isRotary ? t('deg') : t('mm'), color: AXIS_COLORS[upper] || 'text-muted-foreground' }
  })
  const totalDistanceSum = axisDistances.reduce((sum, a) => sum + a.distance, 0)

  return (
    <div className="p-4 space-y-4">
      {/* Total distance traveled */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">{t('Total Distance')}</div>
        <div className="space-y-1.5">
          {axisDistances.map(({ axis, distance, unit, color }) => (
            <div key={axis} className="flex items-center justify-between gap-2">
              <span className={`text-xs font-medium ${color}`}>{axis}:</span>
              <span className="text-xs font-mono font-medium">{distance.toFixed(1)} {unit}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
            <span className="text-xs font-medium">{t('Total:')}</span>
            <span className="text-xs font-mono font-semibold">{totalDistanceSum.toFixed(1)} {t('mm')}</span>
          </div>
        </div>
      </div>

      {/* Operation type pie chart */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">{t('Operation Types')}</div>
        <div className="flex items-center gap-3">
          {/* Simple pie chart visualization - condensed */}
          <div className="relative w-14 h-14 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="transform -rotate-90">
              {operationTypes.reduce((acc, { percent, color }, index) => {
                const prevPercent = acc.prev
                const offset = prevPercent * 3.6 // Convert to degrees
                const length = percent * 3.6
                return {
                  prev: prevPercent + percent,
                  elements: [
                    ...acc.elements,
                    <circle
                      key={index}
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke={color}
                      strokeWidth="10"
                      strokeDasharray={`${length} ${360 - length}`}
                      strokeDashoffset={-offset}
                      className="transition-all"
                    />
                  ]
                }
              }, { prev: 0, elements: [] as JSX.Element[] }).elements}
            </svg>
          </div>
          <div className="flex-1 space-y-0.5">
            {operationTypes.length > 0 ? (
              operationTypes.map(({ type, percent, bgColor, distance }) => (
                <div key={type} className="flex items-center gap-2 text-xs">
                  <div className={`w-2.5 h-2.5 rounded ${bgColor}`} />
                  <span className="flex-1 text-muted-foreground truncate">{type}</span>
                  <span className="font-medium">{percent.toFixed(1)}%</span>
                  <span className="font-mono text-muted-foreground">({distance.toFixed(1)}mm)</span>
                </div>
              ))
            ) : (
              <div className="text-xs text-muted-foreground">{t('No distance data available')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
