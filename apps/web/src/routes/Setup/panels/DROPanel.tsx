import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Home, RotateCcw, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MachineActionButton } from '@/components/MachineActionButton'
import { ActionRequirements } from '@/utils/machineState'
import { EditNameDialog } from '@/components/EditNameDialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useGcodeCommand, useBitsetterReference } from '@/hooks'
import { buildSetZeroCommand, buildGoToZeroCommand } from '@/utils/gcode'
import { useGetExtensionsQuery, useSetExtensionsMutation } from '@/services/api'
import type { PanelProps } from '../types'

// Default workspace IDs (G54-G59)
const WORKSPACE_IDS = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59']

// Default workspace names (only G54 and G55 have non-default names)
const DEFAULT_WORKSPACE_NAMES: Record<string, string> = {
  'G54': 'Main',
  'G55': 'Fixture 2',
}

// Axis color/style configuration
const AXIS_STYLES: Record<string, { color: string; bgColor: string; borderColor: string }> = {
  X: { color: 'text-red-500', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30' },
  Y: { color: 'text-green-500', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/30' },
  Z: { color: 'text-blue-500', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30' },
  A: { color: 'text-orange-500', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30' },
  B: { color: 'text-purple-500', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30' },
  C: { color: 'text-cyan-500', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/30' },
}

export function DROPanel({
  isConnected,
  connectedPort,
  machineStatus,
  onFlashStatus,
  machinePosition = { x: 0, y: 0, z: 0 },
  workPosition = { x: 0, y: 0, z: 0 },
  currentWCS = 'G54',
  availableAxes = ['x', 'y', 'z'],
}: PanelProps) {
  const { t } = useTranslation()
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  
  // Load workspace names from extensions API
  const { data: savedWorkspaces } = useGetExtensionsQuery({ key: 'workspaces' })
  const [setExtensions] = useSetExtensionsMutation()
  
  // Merge saved workspace names with defaults
  // Saved format: { G54: 'Main', G55: 'Fixture 2', ... }
  // Convert to array format for component state: [{ id: 'G54', name: 'Main' }, ...]
  const workspaces = useMemo(() => {
    const savedNames = (savedWorkspaces || {}) as Record<string, string>
    
    return WORKSPACE_IDS.map(id => ({
      id,
      name: savedNames[id] || DEFAULT_WORKSPACE_NAMES[id] || id
    }))
  }, [savedWorkspaces])
  
  // Use currentWCS from props, fallback to G54
  const workspace = currentWCS || 'G54'
  const currentWorkspace = workspaces.find(ws => ws.id === workspace)
  
  // Hooks for G-code commands and bitsetter reference
  const { sendGcode } = useGcodeCommand(connectedPort)
  const { clearBitsetterReference } = useBitsetterReference()
  
  // Handle zero out work offset for a single axis
  const handleZeroAxis = useCallback(async (axis: string) => {
    // Clear bitsetter reference if Z zero is being set (bitsetter reference becomes invalid)
    if (axis === 'Z') {
      await clearBitsetterReference(workspace)
    }

    const axisLower = axis.toLowerCase()
    const gcode = buildSetZeroCommand(workspace, axisLower)
    if (gcode) {
      sendGcode(gcode)
    }
  }, [workspace, clearBitsetterReference, sendGcode])
  
  // Handle zero out all work offsets
  const handleZeroAll = useCallback(async () => {
    // Clear bitsetter reference when zeroing all axes (includes Z)
    await clearBitsetterReference(workspace)

    const allAxes = availableAxes.join('')
    const gcode = buildSetZeroCommand(workspace, allAxes)
    if (gcode) {
      sendGcode(gcode)
    }
  }, [workspace, availableAxes, clearBitsetterReference, sendGcode])
  
  // Handle go to work zero for a single axis
  const handleGoToZeroAxis = useCallback((axis: string) => {
    const gcode = buildGoToZeroCommand(axis)
    if (gcode) {
      sendGcode(gcode)
    }
  }, [sendGcode])

  // Handle go to work zero for all axes
  const handleGoToZeroAll = useCallback(() => {
    const allAxes = availableAxes.map(a => a.toUpperCase()).join('')
    const gcode = buildGoToZeroCommand(allAxes)
    if (gcode) {
      sendGcode(gcode)
    }
  }, [availableAxes, sendGcode])
  
  const handleEditClick = () => {
    setEditDialogOpen(true)
  }
  
  const handleSaveName = useCallback(async (newName: string) => {
    try {
      // Get current saved workspace names
      const savedNames = (savedWorkspaces || {}) as Record<string, string>
      
      // Update the workspace name
      const updatedNames = {
        ...savedNames,
        [workspace]: newName.trim() || workspace // Use workspace ID as fallback if empty
      }
      
      // Persist to backend via extensions API
      await setExtensions({ key: 'workspaces', data: updatedNames }).unwrap()
    } catch (error) {
      console.error('Failed to save workspace name:', error)
      // On error, could show a toast notification, but for now just log
    }
  }, [workspace, savedWorkspaces, setExtensions])
  
  const axes = useMemo(() => {
    return availableAxes.map(a => {
      const upper = a.toUpperCase()
      const style = AXIS_STYLES[upper] || AXIS_STYLES.X
      const mpos = (machinePosition as Record<string, number | undefined>)[a] ?? 0
      const wpos = (workPosition as Record<string, number | undefined>)[a] ?? 0
      return { axis: upper, ...style, mpos, wpos }
    })
  }, [availableAxes, machinePosition, workPosition])

  return (
    <div className="p-3 space-y-2">
        {/* Workspace selector dropdown */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-muted-foreground">{t('Workspace:')}</span>
          <Select value={workspace} onValueChange={() => {}} disabled>
            <SelectTrigger className="h-8 flex-1">
              <SelectValue>
                <span className="font-mono text-muted-foreground mr-2">{workspace}</span>
                <span>{currentWorkspace?.name}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {workspaces.map((ws) => (
                <SelectItem key={ws.id} value={ws.id}>
                  <span className="font-mono text-muted-foreground mr-2">{ws.id}</span>
                  <span>{ws.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={handleEditClick}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        </div>
        
        {/* Edit workspace name dialog */}
        <EditNameDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          title={t('Rename Workspace {{workspace}}', { workspace })}
          label={t('Workspace name')}
          initialValue={currentWorkspace?.name || ''}
          onSave={handleSaveName}
          placeholder={t('Workspace name')}
        />
        
        {/* Column headers */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-5" /> {/* Axis label spacer */}
          <div className="w-8 text-center">{t('Zero')}</div>
          <div className="flex-1 text-center">{t('Workspace')}</div>
          <div className="w-20 text-center">{t('Machine')}</div>
          <div className="w-8 text-center">{t('Go')}</div>
        </div>
        
        {/* Axis readouts - 4 column layout */}
        {axes.map(({ axis, color, bgColor, borderColor, mpos, wpos }) => (
          <div key={axis} className="flex items-center gap-1.5">
            {/* Axis label */}
            <span className={`text-sm font-bold w-5 ${color}`}>{axis}</span>
            
            {/* Set Zero button - icon only */}
            <MachineActionButton
              isConnected={isConnected}
              connectedPort={connectedPort}
              machineStatus={machineStatus}
              onFlashStatus={onFlashStatus}
              onAction={() => handleZeroAxis(axis)}
              requirements={ActionRequirements.standard}
              variant="outline"
              size="sm"
              className="w-8 h-8 p-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </MachineActionButton>
            
            {/* Work position - gets the flex space */}
            <div className={`flex-1 ${bgColor} ${borderColor} border rounded px-2 py-1.5 font-mono text-right text-base font-medium`}>
              {wpos.toFixed(3)}
            </div>
            
            {/* Machine position - fixed width, gray */}
            <div className="w-20 bg-muted/30 border border-border rounded px-2 py-1.5 font-mono text-right text-sm text-muted-foreground">
              {mpos.toFixed(2)}
            </div>
            
            {/* Go to Zero button - icon only */}
            <MachineActionButton
              isConnected={isConnected}
              connectedPort={connectedPort}
              machineStatus={machineStatus}
              onFlashStatus={onFlashStatus}
              onAction={() => handleGoToZeroAxis(axis)}
              requirements={ActionRequirements.standard}
              variant="secondary"
              size="sm"
              className="w-8 h-8 p-0"
            >
              <Home className="w-3.5 h-3.5" />
            </MachineActionButton>
          </div>
        ))}
        
        {/* All axes action buttons */}
        <div className="flex gap-2 pt-2 border-t border-border mt-2">
          <MachineActionButton
            isConnected={isConnected}
            connectedPort={connectedPort}
            machineStatus={machineStatus}
            onFlashStatus={onFlashStatus}
            onAction={handleZeroAll}
            requirements={ActionRequirements.standard}
            variant="outline"
            size="sm"
            className="flex-1 w-full h-8"
          >
            <RotateCcw className="w-3 h-3 mr-1" /> {t('Zero All')}
          </MachineActionButton>
          <MachineActionButton
            isConnected={isConnected}
            connectedPort={connectedPort}
            machineStatus={machineStatus}
            onFlashStatus={onFlashStatus}
            onAction={handleGoToZeroAll}
            requirements={ActionRequirements.standard}
            variant="secondary"
            size="sm"
            className="flex-1 w-full h-8"
          >
            <Home className="w-3 h-3 mr-1" /> {t('Go to Zero')}
          </MachineActionButton>
        </div>
    </div>
  )
}
