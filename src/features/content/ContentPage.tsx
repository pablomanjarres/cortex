import { useState } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { WidgetCard } from '@/components/widgets/WidgetCard'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Plus, Instagram, Linkedin, MessageCircle, Flame } from 'lucide-react'

interface PostTask {
  id: string
  platform: string
  icon: typeof Instagram
  done: boolean
}

const dailyPosts: PostTask[] = [
  { id: '1', platform: 'Instagram Reel #1', icon: Instagram, done: false },
  { id: '2', platform: 'Instagram Reel #2', icon: Instagram, done: false },
  { id: '3', platform: 'LinkedIn Post', icon: Linkedin, done: false },
  { id: '4', platform: 'Reddit Post', icon: MessageCircle, done: false },
]

interface EngagementTask {
  id: string
  platform: string
  task: string
  done: boolean
}

const engagementTasks: EngagementTask[] = [
  { id: 'e1', platform: 'Reddit', task: 'Comment on 5 posts', done: false },
  { id: 'e2', platform: 'Reddit', task: 'Reply to comments', done: false },
  { id: 'e3', platform: 'LinkedIn', task: 'Comment on 5 posts', done: false },
  { id: 'e4', platform: 'LinkedIn', task: 'Send 3 DMs', done: false },
  { id: 'e5', platform: 'LinkedIn', task: 'Engage with connections', done: false },
]

type PipelineStage = 'idea' | 'script' | 'filmed' | 'edited' | 'posted' | 'analyzed'

interface ContentItem {
  id: string
  title: string
  platform: string
  stage: PipelineStage
}

const pipelineStages: PipelineStage[] = ['idea', 'script', 'filmed', 'edited', 'posted', 'analyzed']

const samplePipeline: ContentItem[] = [
  { id: 'c1', title: 'How I audit my day', platform: 'IG Reel', stage: 'idea' },
  { id: 'c2', title: 'Founder morning routine', platform: 'IG Reel', stage: 'script' },
  { id: 'c3', title: 'Study tips for CS students', platform: 'LinkedIn', stage: 'idea' },
  { id: 'c4', title: 'Building in public update', platform: 'Reddit', stage: 'filmed' },
]

export function ContentPage() {
  const [posts, setPosts] = useState(dailyPosts)
  const [engagement, setEngagement] = useState(engagementTasks)
  const [pipeline] = useState(samplePipeline)
  const [newIdea, setNewIdea] = useState('')

  const togglePost = (id: string) => {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, done: !p.done } : p)))
  }

  const toggleEngagement = (id: string) => {
    setEngagement((prev) => prev.map((e) => (e.id === id ? { ...e, done: !e.done } : e)))
  }

  const postsCompleted = posts.filter((p) => p.done).length
  const engagementCompleted = engagement.filter((e) => e.done).length

  return (
    <PageShell>
      <Tabs defaultValue="today" className="w-full">
        <TabsList className="mb-6 bg-secondary">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="ideas">Ideas</TabsTrigger>
        </TabsList>

        <TabsContent value="today">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {/* Daily Posting Checklist */}
            <WidgetCard
              title="Daily Posts"
              description={`${postsCompleted}/${posts.length} posted`}
              delay={0}
            >
              <div className="flex flex-col gap-2">
                {posts.map((post) => (
                  <label
                    key={post.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary"
                  >
                    <Checkbox
                      checked={post.done}
                      onCheckedChange={() => togglePost(post.id)}
                    />
                    <post.icon className="h-4 w-4 text-muted-foreground" />
                    <span
                      className={
                        post.done
                          ? 'text-sm text-muted-foreground line-through'
                          : 'text-sm text-foreground'
                      }
                    >
                      {post.platform}
                    </span>
                    {post.done && (
                      <Badge variant="secondary" className="ml-auto text-[10px]">Done</Badge>
                    )}
                  </label>
                ))}
              </div>
            </WidgetCard>

            {/* Engagement Tracker */}
            <WidgetCard
              title="Engagement Tasks"
              description={`${engagementCompleted}/${engagement.length} done`}
              delay={0.1}
            >
              <div className="flex flex-col gap-2">
                {engagement.map((task) => (
                  <label
                    key={task.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary"
                  >
                    <Checkbox
                      checked={task.done}
                      onCheckedChange={() => toggleEngagement(task.id)}
                    />
                    <div className="flex flex-col">
                      <span
                        className={
                          task.done
                            ? 'text-sm text-muted-foreground line-through'
                            : 'text-sm text-foreground'
                        }
                      >
                        {task.task}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{task.platform}</span>
                    </div>
                  </label>
                ))}
              </div>
            </WidgetCard>

            {/* Engagement Streaks */}
            <WidgetCard title="Engagement Streaks" delay={0.2}>
              <div className="flex flex-col gap-3 py-2">
                {[
                  { platform: 'Instagram', streak: 0, icon: Instagram },
                  { platform: 'LinkedIn', streak: 0, icon: Linkedin },
                  { platform: 'Reddit', streak: 0, icon: MessageCircle },
                ].map((item) => (
                  <div key={item.platform} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{item.platform}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Flame className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-semibold tabular-nums">{item.streak}d</span>
                    </div>
                  </div>
                ))}
              </div>
            </WidgetCard>
          </div>
        </TabsContent>

        <TabsContent value="pipeline">
          <WidgetCard title="Content Pipeline" description="Track content from idea to analysis" delay={0}>
            <div className="overflow-x-auto">
              <div className="flex gap-4 min-w-[800px]">
                {pipelineStages.map((stage) => (
                  <div key={stage} className="flex-1">
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {stage}
                    </h4>
                    <div className="flex flex-col gap-2">
                      {pipeline
                        .filter((item) => item.stage === stage)
                        .map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-border bg-secondary/50 p-3"
                          >
                            <p className="text-sm font-medium text-foreground">{item.title}</p>
                            <Badge variant="secondary" className="mt-1.5 text-[10px]">
                              {item.platform}
                            </Badge>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </WidgetCard>
        </TabsContent>

        <TabsContent value="ideas">
          <WidgetCard title="Content Ideas Backlog" delay={0}>
            <div className="mb-4 flex gap-2">
              <Input
                placeholder="New content idea..."
                value={newIdea}
                onChange={(e) => setNewIdea(e.target.value)}
                className="bg-input text-sm"
              />
              <button
                onClick={() => setNewIdea('')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground transition-colors hover:bg-secondary/80"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="text-center text-sm text-muted-foreground py-8">
              Add your first content idea to get started
            </p>
          </WidgetCard>
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}
