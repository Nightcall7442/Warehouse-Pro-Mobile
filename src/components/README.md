# Warehouse Pro Mobile — UI Components

## Design System v2

Cold palette (#e7ebf1 / #3b6fe0), neumorphic soft UI style.

### Core Components

#### Card
Neumorphic card with dual shadow and top highlight line.

```tsx
import { Card } from "./ui";

<Card style={{ padding: 16 }}>
  <Text>Content</Text>
</Card>

<Card variant="accent" onPress={() => {}}>
  <Text>Clickable accent card</Text>
</Card>
```

**Props:**
- `children: ReactNode` — Card content
- `style?: ViewStyle` — Additional styles
- `onPress?: () => void` — Makes card clickable
- `variant?: "default" | "flat" | "accent"` — Visual variant
- `haptic?: boolean` — Enable haptic feedback (default: true)

---

#### Button
Primary gradient button with neumorphic shadows.

```tsx
import { Button } from "./ui";

<Button variant="primary" size="lg" fullWidth onPress={handlePress}>
  Submit
</Button>

<Button variant="secondary" icon="edit" loading={isLoading}>
  Edit
</Button>
```

**Props:**
- `variant: "primary" | "secondary" | "danger" | "ghost" | "success"`
- `size: "sm" | "md" | "lg"`
- `loading?: boolean` — Shows spinner
- `icon?: IconName` — Feather icon name
- `fullWidth?: boolean` — Takes full width

---

#### Badge
Status badge with dot indicator.

```tsx
import { Badge } from "./ui";

<Badge variant="success">Active</Badge>
<Badge variant="danger" icon="alert-circle">Overdue</Badge>
```

**Props:**
- `variant: "default" | "success" | "warning" | "danger" | "info"`
- `icon?: IconName` — Optional Feather icon

---

#### SearchInput
Inset shadow search input.

```tsx
import { SearchInput } from "./ui";

<SearchInput
  value={search}
  onChangeText={setSearch}
  placeholder="Search products..."
/>
```

---

#### EmptyState
Empty state placeholder with icon.

```tsx
import { EmptyState } from "./ui";

<EmptyState
  icon="inbox"
  title="No orders yet"
  description="Create your first order to get started"
/>
```

---

#### ScreenHeader
Page header with safe area padding.

```tsx
import { ScreenHeader } from "./ui";

<ScreenHeader
  title="Dashboard"
  subtitle="Welcome back"
  right={<Button size="sm">Action</Button>}
/>
```

---

### Animated Components

#### FadeInItem
Wrapper that fades in children (no animation in current implementation).

```tsx
import { FadeInItem } from "./Animated";

<FadeInItem delay={100}>
  <Card>Content</Card>
</FadeInItem>
```

---

#### PressableScale
TouchableOpacity with haptic feedback and scale animation.

```tsx
import { PressableScale } from "./Animated";

<PressableScale onPress={handlePress} haptic="medium">
  <View>Press me</View>
</PressableScale>
```

**Props:**
- `haptic: "light" | "medium" | "heavy" | "selection" | "success" | "error" | "none"`

---

### Chart Components

#### ProgressRing
Circular progress indicator.

```tsx
import { ProgressRing } from "./Charts";

<ProgressRing value={75} size={64} strokeWidth={6} color="#1d9e75" />
```

---

#### NeumorphicProgressBar
Horizontal progress bar with neumorphic style.

```tsx
import { NeumorphicProgressBar } from "./Charts";

<NeumorphicProgressBar value={60} height={8} color="#1d9e75" />
```

---

### Theme

Colors are defined in `src/theme.ts`:

```ts
import { useThemeColors } from "../store/theme";

const colors = useThemeColors();
// colors.bg.primary, colors.text.primary, colors.accent.primary, etc.
```

**Dark mode:** Uses `useThemeStore` to toggle between light/dark palettes.
