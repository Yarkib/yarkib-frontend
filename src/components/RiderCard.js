import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

const RiderCard = ({ user, onClose }) => {
  return (
    <LinearGradient
      colors={['#0f1115', '#151a21', '#0f1115']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.cardOuter}
    >
      {/* Lux gold rim */}
      <LinearGradient
        colors={['#D4AF37', '#F8E27C', '#C89D29']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.goldBorder}
      >
        <View style={styles.cardInner}>
          {/* Subtle glossy highlight */}
          <LinearGradient
            colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.04)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gloss}
          />

          {/* Header */}
          <View style={styles.cardHeader}>
            <Text style={styles.brandTiny}>yarkib</Text>
            <Text style={styles.title}>Rider Card</Text>
            <TouchableOpacity onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={18} color={'#E6CF8B'} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.row}>
            <View style={styles.avatarWrap}>
              {user?.avatar ? (
                <Image source={{ uri: user.avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder} />
              )}
            </View>
            <View style={styles.meta}>
              <Text style={styles.name}>{user?.name || user?.email || 'Rider'}</Text>
              {user?.email ? <Text style={styles.sub}>{user.email}</Text> : null}
              {user?.id ? <Text style={styles.sub}>ID: {user.id}</Text> : null}
            </View>
          </View>

          {/* Divider with gold accent */}
          <View style={styles.dividerWrap}>
            <LinearGradient
              colors={['#E6CF8B', '#F5E7A1', '#E6CF8B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.divider}
            />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.note}>Official identity card for Yarkib riders.</Text>
            <View style={styles.badgesRow}>
              <View style={styles.badge}><Text style={styles.badgeText}>Verified</Text></View>
              <View style={styles.badgeOutline}><Text style={styles.badgeOutlineText}>Member</Text></View>
            </View>
          </View>
        </View>
      </LinearGradient>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: 16,
    padding: 2,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  goldBorder: {
    borderRadius: 14,
    padding: 2,
  },
  cardInner: {
    position: 'relative',
    borderRadius: 12,
    backgroundColor: '#12161C',
    padding: 16,
    overflow: 'hidden',
  },
  gloss: {
    position: 'absolute',
    top: -30,
    left: -40,
    right: -40,
    height: 120,
    transform: [{ rotate: '-12deg' }],
  },
  cardHeader: { alignItems: 'center', marginBottom: 12 },
  brandTiny: { fontSize: 10, letterSpacing: 2, color: '#E6CF8B', textTransform: 'uppercase' },
  title: { ...theme.typography.h4, marginTop: 2, color: '#F7F2D8' },
  close: { position: 'absolute', right: 8, top: 8, padding: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1D2430', borderWidth: 1, borderColor: 'rgba(230,207,139,0.4)' },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: { flex: 1 },
  meta: { marginLeft: 12, flex: 1 },
  name: { ...theme.typography.h4, color: '#F7F2D8' },
  sub: { ...theme.typography.caption, color: '#C5C2B6', marginTop: 2 },
  dividerWrap: { marginTop: 12, marginBottom: 10 },
  divider: { height: 2, borderRadius: 1 },
  footer: { marginTop: 6 },
  note: { ...theme.typography.caption, color: '#C5C2B6' },
  badgesRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  badge: { backgroundColor: '#E6CF8B', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12 },
  badgeText: { ...theme.typography.caption, color: '#1A1E24', fontWeight: '700' },
  badgeOutline: { borderWidth: 1, borderColor: '#E6CF8B', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12 },
  badgeOutlineText: { ...theme.typography.caption, color: '#E6CF8B', fontWeight: '600' },
});

export default RiderCard;


