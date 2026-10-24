import { useSearchParams } from 'react-router-dom'
import { Landmark, Wallet } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FinanceBudget } from './FinanceBudget'
import { AccountsSection } from './accounts/AccountsSection'

export function FinancePage() {
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'accounts' ? 'accounts' : 'budget'
  return <Tabs value={view} onValueChange={(value) => setParams((previous) => {
    const next = new URLSearchParams(previous)
    if (value === 'accounts') next.set('view', 'accounts')
    else next.delete('view')
    return next
  })} className="gap-6">
    <TabsList aria-label="Finance sections" className="max-w-full">
      <TabsTrigger value="budget"><Wallet />Budget</TabsTrigger>
      <TabsTrigger value="accounts"><Landmark />Accounts & cards</TabsTrigger>
    </TabsList>
    <TabsContent value="budget"><FinanceBudget /></TabsContent>
    <TabsContent value="accounts"><AccountsSection /></TabsContent>
  </Tabs>
}
