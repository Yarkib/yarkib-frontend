import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

const RouteCard = ({ route, onPress }) => {
  const {
    name,
    description,
    distance,
    duration,
    difficulty,
    rating,
    review_count,
    images,
  } = route;

  const getDifficultyColor = (level) => {
    switch (level.toLowerCase()) {
      case 'easy':
        return '#4CAF50';
      case 'intermediate':
        return '#FF9800';
      case 'hard':
        return '#F44336';
      default:
        return '#757575';
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      {images?.[0] && (
        <Image
          source={{ uri: images[0] }}
          style={styles.image}
          resizeMode="cover"
        />
      )}
      <View style={styles.content}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.description} numberOfLines={2}>
          {description}
        </Text>
        
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Ionicons name="location" size={16} color={theme.colors.primary} />
            <Text style={styles.statText}>{distance} km</Text>
          </View>
          
          <View style={styles.stat}>
            <Ionicons name="time" size={16} color={theme.colors.primary} />
            <Text style={styles.statText}>{Math.round(duration / 60)} hrs</Text>
          </View>
          
          <View style={styles.stat}>
            <View
              style={[
                styles.difficultyBadge,
                { backgroundColor: getDifficultyColor(difficulty) },
              ]}
            >
              <Text style={styles.difficultyText}>
                {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.rating}>
          <Ionicons name="star" size={16} color="#FFD700" />
          <Text style={styles.ratingText}>
            {rating} ({review_count} reviews)
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    marginVertical: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  image: {
    height: 200,
    width: '100%',
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
  },
  content: {
    padding: theme.spacing.md,
  },
  name: {
    ...theme.typography.h2,
    marginBottom: theme.spacing.xs,
  },
  description: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    ...theme.typography.body,
    marginLeft: theme.spacing.xs,
  },
  difficultyBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  difficultyText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    ...theme.typography.body,
    marginLeft: theme.spacing.xs,
  },
});

export default RouteCard;
