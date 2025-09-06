import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { theme } from '../theme/index';

interface ElevationPoint {
  distance: number;
  elevation: number;
}

interface RouteElevationChartProps {
  data: ElevationPoint[];
  maxElevation?: number | null;
  height?: number;
  width?: number;
}

const RouteElevationChart = ({ 
  data, 
  maxElevation = null,
  height = 150,
  width = Dimensions.get('window').width - 48
}: RouteElevationChartProps) => {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.container, { height, width }]}>
        <Text style={styles.noDataText}>No elevation data available</Text>
      </View>
    );
  }

  // Calculate chart dimensions
  const chartHeight = height - 40; // Leave space for labels
  const chartWidth = width - 40; // Leave space for labels

  // Find min and max values
  const minElevation = Math.min(...data.map(point => point.elevation));
  const actualMaxElevation = maxElevation || Math.max(...data.map(point => point.elevation));
  const maxDistance = Math.max(...data.map(point => point.distance));
  
  // Calculate range
  const elevationRange = actualMaxElevation - minElevation;
  
  // Function to normalize points to fit in the chart
  const normalizePoint = (point: ElevationPoint) => {
    const x = (point.distance / maxDistance) * chartWidth;
    const y = chartHeight - ((point.elevation - minElevation) / elevationRange) * chartHeight;
    return { x, y };
  };
  
  // Generate points for the chart
  const normalizedPoints = data.map(normalizePoint);
  
  // Debug the data and normalized points
  console.log('Elevation data points:', data.length);
  console.log('Elevation range:', minElevation, 'to', actualMaxElevation, '=', elevationRange);
  console.log('First few normalized points:', normalizedPoints.slice(0, 3));

  // Calculate elevation labels
  const elevationLabels = [
    Math.round(minElevation),
    Math.round(minElevation + elevationRange / 2),
    Math.round(actualMaxElevation)
  ];

  // Calculate distance labels
  const distanceLabels = [
    0,
    Math.round(maxDistance / 2),
    Math.round(maxDistance)
  ];

  return (
    <View style={[styles.container, { height, width }]}>
      {/* Chart title */}
      <Text style={styles.title}>Elevation Profile</Text>
      
      {/* Y-axis labels (elevation) */}
      <View style={styles.yAxisLabels}>
        {elevationLabels.map((label, index) => (
          <Text 
            key={`y-${index}`} 
            style={[
              styles.axisLabel, 
              { 
                top: index === 0 
                  ? chartHeight - 5 
                  : index === 1 
                    ? chartHeight / 2 
                    : 0 
              }
            ]}
          >
            {label}m
          </Text>
        ))}
      </View>
      
      {/* Chart area */}
      <View style={[styles.chartArea, { height: chartHeight, width: chartWidth }]}>
        {/* Grid lines */}
        <View style={[styles.gridLine, { top: 0 }]} />
        <View style={[styles.gridLine, { top: chartHeight / 2 }]} />
        <View style={[styles.gridLine, { top: chartHeight - 1 }]} />
        
        {/* Path */}
        <View style={styles.pathContainer}>
          <View style={styles.path}>
            {normalizedPoints.map((point, index) => (
              <View 
                key={`point-${index}`}
                style={[
                  styles.pathPoint,
                  { 
                    left: point.x + 30 - 2, // Center the 4px dot
                    top: point.y - 2 // Center the 4px dot
                  }
                ]}
              />
            ))}
          </View>
          
          {/* Line connecting points - using SVG-like approach for better rendering */}
          {normalizedPoints.map((point, index) => {
            if (index === 0) return null;
            const prevPoint = normalizedPoints[index - 1];
            
            // Calculate the distance between points
            const dx = point.x - prevPoint.x;
            const dy = point.y - prevPoint.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Calculate the angle between points
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            
            // Debug the points and angles
            console.log(`Line ${index}: From (${prevPoint.x.toFixed(1)}, ${prevPoint.y.toFixed(1)}) to (${point.x.toFixed(1)}, ${point.y.toFixed(1)}), angle: ${angle.toFixed(1)}°, distance: ${distance.toFixed(1)}`);
            
            return (
              <View 
                key={`line-${index}`}
                style={[
                  styles.pathLine,
                  {
                    position: 'absolute',
                    left: prevPoint.x + 30,
                    top: prevPoint.y,
                    width: distance,
                    height: 2,
                    transform: [
                      { rotate: `${angle}deg` },
                      { translateX: 0 },
                      { translateY: 0 }
                    ],
                    transformOrigin: 'left center',
                    backgroundColor: theme.colors.primary,
                    zIndex: 5
                  }
                ]}
              />
            );
          })}
          
          {/* Fill area under the path */}
          <View 
            style={[
              styles.pathFill,
              {
                height: chartHeight,
                width: chartWidth
              }
            ]}
          >
            {normalizedPoints.length > 1 && normalizedPoints.map((point, index) => {
              if (index === 0 || index === normalizedPoints.length - 1) return null;
              return (
                <View
                  key={`fill-${index}`}
                  style={{
                    position: 'absolute',
                    left: point.x - 1,
                    top: point.y,
                    width: 2,
                    height: chartHeight - point.y,
                    backgroundColor: 'rgba(33, 150, 243, 0.05)'
                  }}
                />
              );
            })}
          </View>
        </View>
      </View>
      
      {/* X-axis labels (distance) */}
      <View style={styles.xAxisLabels}>
        {distanceLabels.map((label, index) => (
          <Text 
            key={`x-${index}`} 
            style={[
              styles.axisLabel, 
              { 
                left: index === 0 
                  ? 30 
                  : index === 1 
                    ? chartWidth / 2 + 15
                    : chartWidth + 5 
              }
            ]}
          >
            {label}km
          </Text>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 8,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    marginVertical: theme.spacing.md,
  },
  title: {
    ...theme.typography.body,
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  chartArea: {
    marginLeft: 30,
    marginTop: 10,
    position: 'relative',
  },
  yAxisLabels: {
    position: 'absolute',
    left: 0,
    top: 30,
    height: '100%',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
  },
  xAxisLabels: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xs,
  },
  axisLabel: {
    ...theme.typography.body,
    fontSize: 10,
    color: theme.colors.textSecondary,
    position: 'absolute',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  pathContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  path: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  pathPoint: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
  pathLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: theme.colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  pathFill: {
    position: 'absolute',
    bottom: 0,
    left: 30,
    backgroundColor: 'transparent',
  },
  noDataText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 60,
  },
});

export default RouteElevationChart;
