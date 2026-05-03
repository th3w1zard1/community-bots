import { useState } from 'react'
import { DateFilter } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CalendarBlank, X } from '@phosphor-icons/react'
import { format } from 'date-fns'

interface ConversationFilterDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dateFilter: DateFilter
  onDateFilterChange: (filter: DateFilter) => void
  customDateRange?: { start: number; end: number }
  onCustomDateRangeChange: (range: { start: number; end: number } | undefined) => void
  selectedTopics: string[]
  onSelectedTopicsChange: (topics: string[]) => void
  availableTopics: string[]
}

export function ConversationFilterDialog({
  open,
  onOpenChange,
  dateFilter,
  onDateFilterChange,
  customDateRange,
  onCustomDateRangeChange,
  selectedTopics,
  onSelectedTopicsChange,
  availableTopics,
}: ConversationFilterDialogProps) {
  const [startDate, setStartDate] = useState<Date | undefined>(
    customDateRange ? new Date(customDateRange.start) : undefined
  )
  const [endDate, setEndDate] = useState<Date | undefined>(
    customDateRange ? new Date(customDateRange.end) : undefined
  )

  const handleDateFilterChange = (value: string) => {
    onDateFilterChange(value as DateFilter)
    if (value !== 'custom') {
      onCustomDateRangeChange(undefined)
      setStartDate(undefined)
      setEndDate(undefined)
    }
  }

  const handleApplyCustomRange = () => {
    if (startDate && endDate) {
      onCustomDateRangeChange({
        start: startDate.getTime(),
        end: endDate.getTime(),
      })
    }
  }

  const toggleTopic = (topic: string) => {
    if (selectedTopics.includes(topic)) {
      onSelectedTopicsChange(selectedTopics.filter(t => t !== topic))
    } else {
      onSelectedTopicsChange([...selectedTopics, topic])
    }
  }

  const clearAllFilters = () => {
    onDateFilterChange('all')
    onCustomDateRangeChange(undefined)
    onSelectedTopicsChange([])
    setStartDate(undefined)
    setEndDate(undefined)
  }

  const activeFilterCount = 
    (dateFilter !== 'all' ? 1 : 0) + selectedTopics.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Filter Conversations</DialogTitle>
          <DialogDescription>
            Filter your conversations by date range and topics
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Date Range</Label>
              {activeFilterCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="text-xs h-7"
                >
                  Clear All
                </Button>
              )}
            </div>
            
            <RadioGroup value={dateFilter} onValueChange={handleDateFilterChange}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="all" />
                <Label htmlFor="all" className="font-normal cursor-pointer">All Time</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="today" id="today" />
                <Label htmlFor="today" className="font-normal cursor-pointer">Today</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="week" id="week" />
                <Label htmlFor="week" className="font-normal cursor-pointer">Past Week</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="month" id="month" />
                <Label htmlFor="month" className="font-normal cursor-pointer">Past Month</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="custom" />
                <Label htmlFor="custom" className="font-normal cursor-pointer">Custom Range</Label>
              </div>
            </RadioGroup>

            {dateFilter === 'custom' && (
              <div className="ml-6 mt-3 space-y-3 p-4 border border-border rounded-lg bg-muted/30">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm">Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                        >
                          <CalendarBlank size={16} className="mr-2" />
                          {startDate ? format(startDate, 'PP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={setStartDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                        >
                          <CalendarBlank size={16} className="mr-2" />
                          {endDate ? format(endDate, 'PP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={setEndDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <Button
                  onClick={handleApplyCustomRange}
                  disabled={!startDate || !endDate}
                  size="sm"
                  className="w-full"
                >
                  Apply Date Range
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-base font-semibold">
              Topics {selectedTopics.length > 0 && `(${selectedTopics.length})`}
            </Label>
            
            {availableTopics.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No topics available yet. Topics are automatically extracted from your conversations.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableTopics.map(topic => {
                  const isSelected = selectedTopics.includes(topic)
                  return (
                    <Badge
                      key={topic}
                      variant={isSelected ? 'default' : 'outline'}
                      className="cursor-pointer px-3 py-1.5 text-sm transition-all hover:scale-105"
                      onClick={() => toggleTopic(topic)}
                    >
                      {topic}
                      {isSelected && (
                        <X size={14} weight="bold" className="ml-1.5" />
                      )}
                    </Badge>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
