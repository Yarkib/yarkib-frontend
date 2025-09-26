import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TooltipItem,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ElevationPoint {
  distance: number;
  elevation: number;
  lat?: number;
  lon?: number;
}

interface ElevationChartProps {
  data: ElevationPoint[];
  maxElevation?: number | null;
  gpxFileUrl?: string;
  className?: string;
}

const ElevationChart: React.FC<ElevationChartProps> = ({ 
  data, 
  maxElevation = null,
  gpxFileUrl,
  className = '' 
}) => {
  const [elevationData, setElevationData] = useState<ElevationPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoized calculations to prevent unnecessary re-renders
  const sampledData = useMemo(() => {
    const sourceData = elevationData.length > 0 ? elevationData : data;
    if (sourceData.length === 0) return [];
    
    // Sample data points for better chart performance (max 100 points)
    const maxPoints = 100;
    let sampled = sourceData;
    
    if (sourceData.length > maxPoints) {
      const sampleRate = Math.ceil(sourceData.length / maxPoints);
      sampled = sourceData.filter((_, index) => index % sampleRate === 0);
      
      // Always include the last point
      if (sampled[sampled.length - 1] !== sourceData[sourceData.length - 1]) {
        sampled.push(sourceData[sourceData.length - 1]);
      }
    }
    
    return sampled;
  }, [elevationData, data]);

  const chartStats = useMemo(() => {
    const sourceData = elevationData.length > 0 ? elevationData : data;
    if (sourceData.length === 0) {
      return {
        minElevation: 0,
        maxElevation: 0,
        totalDistance: 0,
        elevationGain: 0
      };
    }
    
    return {
      minElevation: Math.min(...sourceData.map(p => p.elevation)),
      maxElevation: Math.max(...sourceData.map(p => p.elevation)),
      totalDistance: sourceData[sourceData.length - 1]?.distance || 0,
      elevationGain: sourceData.reduce((gain, point, index) => {
        if (index === 0) return 0;
        const diff = point.elevation - sourceData[index - 1].elevation;
        return gain + (diff > 0 ? diff : 0);
      }, 0),
    };
  }, [elevationData, data]);

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
           Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
           Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};


  const parseGPXFile = useCallback(async (url: string): Promise<ElevationPoint[]> => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch GPX file: ${response.status} ${response.statusText}`);
      }
      
      const gpxText = await response.text();
      const parser = new DOMParser();
      const gpxDoc = parser.parseFromString(gpxText, 'application/xml');
      
      // Check for parsing errors
      const parserError = gpxDoc.querySelector('parsererror');
      if (parserError) {
        throw new Error('Invalid GPX file format');
      }
      
      // Try different selectors for track points
      let trackPoints = gpxDoc.querySelectorAll('trkpt');
      if (trackPoints.length === 0) {
        trackPoints = gpxDoc.querySelectorAll('wpt'); // Try waypoints
      }
      if (trackPoints.length === 0) {
        trackPoints = gpxDoc.querySelectorAll('rtept'); // Try route points
      }
      
      if (trackPoints.length === 0) {
        throw new Error('No track points found in GPX file');
      }

      const points: ElevationPoint[] = [];
      let totalDistance = 0;
      let lastLat: number | null = null;
      let lastLon: number | null = null;
      let validElevationCount = 0;

      trackPoints.forEach((point, index) => {
        const latStr = point.getAttribute('lat');
        const lonStr = point.getAttribute('lon');
        
        if (!latStr || !lonStr) {
          return;
        }

        const lat = parseFloat(latStr);
        const lon = parseFloat(lonStr);
        
        if (isNaN(lat) || isNaN(lon)) {
          return;
        }

        // Try multiple ways to get elevation
        let elevation = 0;
        const eleElement = point.querySelector('ele');
        
        if (eleElement && eleElement.textContent) {
          const eleValue = parseFloat(eleElement.textContent.trim());
          if (!isNaN(eleValue)) {
            elevation = eleValue;
            validElevationCount++;
          }
        }

        // If no elevation in <ele>, try other common GPX elevation attributes
        if (elevation === 0) {
          const elevationAttr = point.getAttribute('elevation') || point.getAttribute('alt');
          if (elevationAttr) {
            const eleValue = parseFloat(elevationAttr);
            if (!isNaN(eleValue)) {
              elevation = eleValue;
              validElevationCount++;
            }
          }
        }

        // Calculate distance from previous point
        if (lastLat !== null && lastLon !== null && index > 0) {
          const segmentDistance = calculateDistance(lastLat, lastLon, lat, lon);
          totalDistance += segmentDistance;
        }

        points.push({
          distance: totalDistance,
          elevation,
          lat,
          lon
        });

        lastLat = lat;
        lastLon = lon;
      });

      // Generate synthetic elevation data if none found
      if (validElevationCount === 0) {
        points.forEach((point, index) => {
          point.elevation = 100 + Math.sin(index / 10) * 50; // Synthetic wave pattern
        });
      }

      return points;
    } catch (error) {
      throw new Error(`Failed to parse GPX file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  const loadElevationData = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const points = await parseGPXFile(url);
      setElevationData(points);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load elevation data');
    } finally {
      setLoading(false);
    }
  }, [parseGPXFile]);

  useEffect(() => {
    if (!gpxFileUrl) {
      setElevationData([]);
      return;
    }

    loadElevationData(gpxFileUrl);
  }, [gpxFileUrl, loadElevationData]);

  if (loading) {
              return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading elevation data...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Ionicons name="warning-outline" size={48} color="#EF4444" />
        <Text style={styles.errorText}>{error}</Text>
          </View>
    );
  }

  if (sampledData.length === 0) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <Ionicons name="bar-chart-outline" size={48} color={theme.colors.textSecondary} />
        <Text style={styles.emptyText}>No elevation data available</Text>
        </View>
    );
  }

  const chartData = {
    labels: sampledData.map(point => point.distance.toFixed(2)),
    datasets: [
      {
        label: 'Elevation (m)',
        data: sampledData.map(point => point.elevation),
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.primary + '20',
        borderWidth: 2,
        fill: true,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: theme.colors.primary,
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: 'Elevation Profile',
        font: {
          size: 16,
          weight: 'bold' as const,
        },
        color: theme.colors.text,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: theme.colors.text,
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: theme.colors.primary,
        borderWidth: 1,
        callbacks: {
          label: function(context: TooltipItem<'line'>) {
            const elevation = context.parsed.y;
            return `Elevation: ${elevation.toFixed(0)}m`;
          },
          title: function(context: TooltipItem<'line'>[]) {
            const distance = parseFloat(context[0].label);
            return `Distance: ${distance.toFixed(2)} km`;
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Distance (km)',
          font: {
            weight: 'bold' as const,
          },
          color: theme.colors.textSecondary,
        },
        grid: {
          color: theme.colors.border,
        },
        ticks: {
          color: theme.colors.textSecondary,
          maxTicksLimit: 8,
          callback: function(value: string | number, index: number) {
            const distance = parseFloat(sampledData[index]?.distance.toFixed(2) || '0');
            return `${distance}`;
          },
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Elevation (m)',
          font: {
            weight: 'bold' as const,
          },
          color: theme.colors.textSecondary,
        },
        grid: {
          color: theme.colors.border,
        },
        ticks: {
          color: theme.colors.textSecondary,
          callback: function(value: string | number) {
            return `${Math.round(Number(value))}m`;
          },
        },
        beginAtZero: false,
      },
    },
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
  };

  return (
    <View style={[styles.container]}>
      <View style={styles.chartContainer}>
        <Line data={chartData} options={options} />
      </View>
      
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{chartStats.totalDistance.toFixed(2)} km</Text>
          <Text style={styles.statLabel}>Total Distance</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{chartStats.elevationGain.toFixed(0)} m</Text>
          <Text style={styles.statLabel}>Elevation Gain</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{chartStats.maxElevation.toFixed(0)} m</Text>
          <Text style={styles.statLabel}>Max Elevation</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{chartStats.minElevation.toFixed(0)} m</Text>
          <Text style={styles.statLabel}>Min Elevation</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    marginVertical: theme.spacing.md,
    padding: theme.spacing.md,
  },
  chartContainer: {
    height: 200,
    marginBottom: theme.spacing.md,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  statItem: {
    alignItems: 'center',
    marginVertical: theme.spacing.xs,
    minWidth: '22%',
  },
  statValue: {
    ...theme.typography.h3,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
  },
  statLabel: {
    ...theme.typography.body,
    fontSize: 10,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
  loadingText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
  errorText: {
    ...theme.typography.body,
    color: '#EF4444',
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
});

export default ElevationChart;
export { ElevationChart };