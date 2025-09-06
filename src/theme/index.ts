import { TextStyle } from 'react-native';

type FontWeight = 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';

interface TypographyStyle {
  fontSize: number;
  fontWeight?: FontWeight;
  lineHeight?: number;
}

interface ThemeColors {
  primary: string;
  background: string;
  text: string;
  textSecondary: string;
  inputBackground: string;
  card: string;
  border: string;
  error: string;
}

interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

interface ThemeBorderRadius {
  sm: number;
  md: number;
  lg: number;
}

interface ThemeTypography {
  h1: TypographyStyle;
  h2: TypographyStyle;
  h3: TypographyStyle;
  h4: TypographyStyle;
  body: TypographyStyle;
  bodyBold: TypographyStyle;
  caption: TypographyStyle;
  button: TypographyStyle;
}

export interface Theme {
  colors: ThemeColors;
  spacing: ThemeSpacing;
  borderRadius: ThemeBorderRadius;
  typography: ThemeTypography;
}

export const theme: Theme = {
  colors: {
    primary: '#111111',
    background: '#FFFFFF',
    text: '#0A0A0A',
    textSecondary: '#6B7280',
    inputBackground: '#F3F4F6',
    card: '#FFFFFF',
    border: '#E5E7EB',
    error: '#EF4444',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
  },
  typography: {
    h1: {
      fontSize: 32,
      fontWeight: 'bold',
    },
    h2: {
      fontSize: 24,
      fontWeight: 'bold',
    },
    h3: {
      fontSize: 20,
      fontWeight: '700',
    },
    h4: {
      fontSize: 18,
      fontWeight: '600',
    },
    body: {
      fontSize: 16,
    },
    bodyBold: {
      fontSize: 16,
      fontWeight: '600',
    },
    caption: {
      fontSize: 12,
      color: '#6B7280',
    },
    button: {
      fontSize: 18,
      fontWeight: '600',
    },
  },
};
