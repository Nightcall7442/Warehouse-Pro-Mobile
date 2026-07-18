import React from "react";
import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Typography, Spacing, Radii } from "../theme";
import { useThemeColors } from "../store/theme";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function ErrorFallback({ error }: { error: Error | null }) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg.primary,
        alignItems: "center",
        justifyContent: "center",
        padding: Spacing.xl,
        gap: 16,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: Radii.full,
          backgroundColor: colors.status.dangerDim,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name="alert-triangle" size={32} color={colors.status.danger} />
      </View>
      <Text
        style={{
          fontFamily: Typography.fontBold,
          fontSize: Typography.size.lg,
          color: colors.text.primary,
          textAlign: "center",
        }}
      >
        Произошла ошибка
      </Text>
      <Text
        style={{
          fontFamily: Typography.fontRegular,
          fontSize: Typography.size.sm,
          color: colors.text.muted,
          textAlign: "center",
          lineHeight: 20,
          maxWidth: 280,
        }}
      >
        {error?.message ?? "Неожиданная ошибка. Перезапустите приложение."}
      </Text>
    </View>
  );
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error.message, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
