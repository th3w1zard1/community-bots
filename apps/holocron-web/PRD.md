# Planning Guide

A minimal, intelligent Q&A assistant that demonstrates multi-source retrieval and answer aggregation with a focus on concise, high-signal responses in a clean chat interface.

**Experience Qualities**:
1. **Quiet** - The interface prioritizes minimal visual noise, with responses appearing only when truly relevant and valuable
2. **Precise** - Every answer is distilled to its essence, avoiding unnecessary elaboration unless explicitly requested
3. **Intelligent** - Multi-agent retrieval system that aggregates information from multiple sources to provide the most accurate answer

**Complexity Level**: Light Application (multiple features with basic state)
The app features a chat interface with intelligent question detection, multi-agent retrieval simulation, and expandable responses, with light/dark theme toggle and integrated navigation to the OpenKotOR ecosystem.

## Essential Features

### Top Navigation Bar
- **Functionality**: Displays OpenKotOR branding and links to main site sections, with theme toggle and Discord invite
- **Purpose**: Provides navigation context and allows users to access the broader OpenKotOR ecosystem
- **Trigger**: Always visible at top of screen
- **Progression**: User clicks navigation links → Opens openkotor.com sections in new tabs → User toggles theme → Interface switches between light/dark mode
- **Success criteria**: Navigation links work correctly, theme toggle persists preference, Discord button links to invite

### Light/Dark Mode Toggle
- **Functionality**: Switches between light and dark color themes with persistent preference
- **Purpose**: Allows users to choose their preferred visual style for different environments
- **Trigger**: User clicks sun/moon icon in top nav
- **Progression**: User clicks theme toggle → Interface transitions to opposite theme → Preference saved → Theme persists on reload
- **Success criteria**: Theme transitions smoothly, preference persists between sessions, all UI elements adapt correctly to both themes

### Question Input & Detection
- **Functionality**: Text input that accepts user questions and detects whether a query warrants a response
- **Purpose**: Allows users to ask questions while filtering out non-questions or unclear inputs
- **Trigger**: User types and submits a message
- **Progression**: User types question → Input validates → Question detection analyzes relevance → If valid, triggers retrieval → If invalid, provides minimal feedback
- **Success criteria**: Questions are accurately identified and non-questions are politely filtered

### Multi-Source Retrieval System
- **Functionality**: Queries multiple knowledge sources (lucasforumsarchive.org, deadlystream.com, GitHub repos) and aggregates results with configurable source weights
- **Purpose**: Gathers information from disparate sources using real web scraping and search techniques, with user control over which sources are trusted more
- **Trigger**: Valid question detected
- **Progression**: Question received → Multiple "agents" scrape/search their respective sources in parallel → Content extracted and analyzed → Results aggregated with source weights applied → Confidence scored → Best answer selected
- **Success criteria**: Visual feedback shows multi-source retrieval happening, with final answer synthesized from multiple perspectives weighted by user preferences and actual retrieved content

### Source Weight Configuration
- **Functionality**: Allows users to adjust priority weights for each information source and enable/disable sources
- **Purpose**: Gives users control over which sources influence answers more heavily
- **Trigger**: User clicks settings icon in header
- **Progression**: Settings button clicked → Dialog opens showing all sources → User adjusts sliders (0.1x to 2.0x weight) or toggles sources → Changes saved automatically → Future queries use new weights
- **Success criteria**: Weight changes persist between sessions and visibly affect answer confidence scores and prioritization

### Concise Answer Display
- **Functionality**: Displays ultra-concise (1-2 sentence) answers with optional expansion
- **Purpose**: Respects user attention by providing just enough information, with depth available on demand
- **Trigger**: Retrieval system completes
- **Progression**: Answer generated → Concise version displayed → User can click "Show more" → Expanded version with sources appears
- **Success criteria**: Answers are immediately useful in their concise form and provide additional context when expanded

### Conversation History
- **Functionality**: Maintains multiple conversation threads with session-based persistence, including search and filtering capabilities
- **Purpose**: Allows users to manage multiple conversation contexts, revisit previous discussions, and quickly find past conversations by content, date, or topic
- **Trigger**: User starts new conversation, selects existing one, searches, or applies filters
- **Progression**: User creates/selects conversation → Questions asked within that thread → Answers provided → Thread auto-saves with extracted topics → User can switch between conversations → Search/filter to find specific conversations → Conversations persist in sidebar
- **Success criteria**: Multiple conversation threads persist independently, can be selected from sidebar, filtered by date ranges, searchable by content, and filterable by auto-extracted topics

### Conversation Search & Filtering
- **Functionality**: Real-time search across all conversations with multiple filter options including date ranges and topic tags
- **Purpose**: Enables users to quickly locate specific conversations from potentially large conversation histories
- **Trigger**: User types in search box or clicks filter button
- **Progression**: User enters search query → Conversations filtered in real-time by title, message content, and topics → User opens filter dialog → Selects date range (today/week/month/custom) or topic tags → Filtered results shown instantly → Clear filters to reset
- **Success criteria**: Search returns relevant results within 100ms, date filters work correctly with custom ranges, topic tags are automatically extracted from conversations and can be used for filtering

### Real Content Scraping & Extraction
- **Functionality**: Fetches and extracts relevant content from configured sources using web scraping and search techniques
- **Purpose**: Provides actual answers based on real source content rather than simulated data
- **Trigger**: Valid question passes relevance check
- **Progression**: Query analyzed → Search terms extracted → Each source scraped/queried in parallel → Content extracted from HTML → Relevant snippets identified → Results ranked by relevance and source weight
- **Success criteria**: System successfully retrieves real content from live sources and extracts meaningful snippets for answer generation

## Edge Case Handling

- **Empty/Vague Questions**: Minimal "Could you clarify?" response without triggering full retrieval
- **Repeated Questions**: Detect similarity to recent questions and either reference previous answer or acknowledge repetition
- **Source Unavailability**: Gracefully handle when sources fail to respond or return errors
- **Long Responses**: Automatically collapse responses longer than 2 sentences into expandable sections
- **Context Overload**: Limit conversation history context sent to LLM to prevent token overflow
- **Conversation Management**: Allow deletion, renaming, and archiving of conversation threads
- **Scraping Failures**: Handle rate limits, timeouts, and HTML parsing errors gracefully
- **No Search Results**: Show helpful message when search/filters return no conversations
- **Large Topic Lists**: Show only top 2 topics per conversation in sidebar, with "+N" indicator for additional topics
- **Empty Topics**: Handle conversations without extracted topics gracefully in filter UI

## Design Direction

The design should evoke the mystical, technological aesthetic of the Star Wars universe - specifically inspired by Jedi holocrons and ancient galactic archives. The interface should feel like accessing an advanced knowledge repository, with glowing accents, subtle scan-line effects, and a sense of accessing forbidden or rare knowledge from across the galaxy.

## Color Selection

A dual-theme palette supporting both light and dark modes, maintaining the Star Wars aesthetic in both variations.

**Dark Mode (default):**
- **Primary Color**: Deep cyber purple (oklch(0.55 0.18 280)) - Evokes holocron glow and Force sensitivity, used for interactive elements and primary actions
- **Secondary Colors**: Deep space blue-gray (oklch(0.12 0.04 240)) for card backgrounds; True deep background (oklch(0.08 0.03 240)) for main background
- **Accent Color**: Bright cyan-green (oklch(0.65 0.22 145)) - Reminiscent of lightsaber glow and holographic projections, used for highlights, success states, and active elements
- **Foreground/Background Pairings**: 
  - Background (Deep space oklch(0.08 0.03 240)): Bright cyan text (oklch(0.88 0.08 210)) - Ratio 10.8:1 ✓
  - Primary (Cyber purple oklch(0.55 0.18 280)): Bright text (oklch(0.98 0.02 210)) - Ratio 7.2:1 ✓
  - Accent (Cyan-green oklch(0.65 0.22 145)): Bright text (oklch(0.98 0.02 210)) - Ratio 6.8:1 ✓
  - Card (Space blue oklch(0.12 0.04 240)): Cyan text (oklch(0.88 0.08 210)) - Ratio 8.5:1 ✓

**Light Mode:**
- **Primary Color**: Rich purple (oklch(0.50 0.18 280)) - Maintains purple theme with adjusted brightness for light backgrounds
- **Secondary Colors**: Soft gray (oklch(0.92 0.02 240)) for card backgrounds; Near white (oklch(0.98 0.01 240)) for main background
- **Accent Color**: Vibrant teal (oklch(0.55 0.20 145)) - Adapted accent color for light mode visibility
- **Foreground/Background Pairings**:
  - Background (Near white oklch(0.98 0.01 240)): Dark blue-gray text (oklch(0.12 0.04 240)) - Ratio 14.2:1 ✓
  - Primary (Rich purple oklch(0.50 0.18 280)): White text (oklch(0.98 0.02 210)) - Ratio 8.5:1 ✓
  - Accent (Vibrant teal oklch(0.55 0.20 145)): White text (oklch(0.98 0.02 210)) - Ratio 7.1:1 ✓
  - Card (Soft gray oklch(0.92 0.02 240)): Dark text (oklch(0.12 0.04 240)) - Ratio 12.8:1 ✓

## Font Selection

Typography should feel futuristic and technical, reminiscent of Star Wars UI displays and terminal interfaces.

- **Typographic Hierarchy**:
  - H1 (App Title): Orbitron Bold / 28px / 0.05em letter spacing / 1.1 line height / uppercase
  - H2 (Section Headers): Orbitron Medium / 18px / 0.04em letter spacing / 1.3 line height / uppercase
  - Body (Messages): Rajdhani Regular / 15px / normal letter spacing / 1.6 line height
  - Small (Metadata/Sources): Rajdhani Regular / 13px / normal letter spacing / 1.4 line height
  - Code (Technical terms): Share Tech Mono Regular / 14px / normal letter spacing / 1.5 line height

## Animations

Animations should reinforce the holographic, futuristic feel of accessing a Jedi holocron. Use glowing effects, subtle pulsing, and scan-line aesthetics that suggest advanced technology.

- Glowing text effects on headers that pulse gently
- Typing indicators with holographic shimmer when agents are "retrieving"
- Staggered fade-in with glow effects for agent results (showing parallel retrieval)
- Smooth expansion with light trails for "Show more" sections
- Gentle slide-in with blur fade for new messages
- Pulsing glow when answer is synthesized from multiple sources
- Backdrop effects using radial gradients and subtle scan-line patterns

## Component Selection

- **Components**:
  - `Card` - For message bubbles and agent result previews (modified with subtle shadows and tighter padding)
  - `Input` - For question entry and conversation search (customized with larger text and subtle focus states)
  - `Button` - For submit and "Show more" actions (variant="ghost" for minimal look)
  - `ScrollArea` - For conversation history
  - `Badge` - For source labels, confidence indicators, and topic tags
  - `Separator` - For dividing conversation threads
  - `Skeleton` - For loading states during retrieval
  - `Dialog` - For source weight configuration settings and conversation filters
  - `Slider` - For adjusting source priority weights
  - `Switch` - For enabling/disabling sources
  - `Calendar` - For custom date range selection in filter dialog
  - `RadioGroup` - For selecting date filter presets (today, week, month, custom)
  - `Popover` - For date picker in custom range selection

- **Customizations**:
  - Custom message component that differentiates user vs. bot messages with subtle positioning
  - Custom "agent panel" component showing parallel retrieval (not a standard shadcn component)
  - Custom expand/collapse animation for extended answers

- **States**:
  - Input: Subtle border highlight on focus, disabled state during processing
  - Buttons: Ghost style with hover opacity change, no heavy shadows
  - Messages: Slight scale on hover for bot messages (indicating expandability), distinct styling for user vs. system
  - Agent cards: Pulse animation during retrieval, fade to static once complete

- **Icon Selection**:
  - `MagnifyingGlass` - For search/retrieval indicators and conversation search
  - `ArrowRight` - For submit button
  - `CaretDown/CaretUp` - For expand/collapse
  - `Sparkle` - For AI/aggregation indicator
  - `Link` - For source references
  - `Question` - For help/unclear query states
  - `Sliders` - For source weight settings button
  - `Funnel` - For conversation filter button
  - `ChatCircle` - For conversation items in sidebar
  - `Plus` - For new conversation button
  - `Trash` - For deleting conversations
  - `X` - For clearing search and removing topic filters
  - `CalendarBlank` - For date range picker
  - `Sun/Moon` - For theme toggle
  - `Keyboard` - For keyboard shortcuts

- **Spacing**:
  - Message bubbles: px-4 py-3 with mb-3 between messages
  - Container: px-6 py-4 for main chat area
  - Input area: p-4 with fixed positioning at bottom
  - Agent panels: gap-2 for grid layout, px-3 py-2 for individual cards

- **Mobile**:
  - Stack agent panels vertically instead of horizontal grid
  - Reduce padding on message bubbles to px-3 py-2
  - Fixed input at bottom with safe-area-inset for iOS
  - Single column layout with full width messages
  - Reduce font sizes slightly (H1 to 24px, body to 14px)
