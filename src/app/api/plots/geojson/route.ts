import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
function normaliseCoordinates(value: unknown): [number, number][] | null {
  if (!Array.isArray(value)) return null
  const points: [number, number][] = []
  for (const candidate of value) {
    if (Array.isArray(candidate) && candidate.length === 2) {
      const [x, y] = candidate
      if (typeof x === 'number' && typeof y === 'number') {
        points.push([x, y])
      }
    }
  }
  return points.length > 0 ? points : null
}
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mapSlug = searchParams.get('map') ?? undefined

    const plots = await prisma.plot.findMany({
      where: {
        coordinates: {
          not: Prisma.JsonNull,
        },
        ...(mapSlug ? { map: { slug: mapSlug } } : {}),
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    const features = plots
      .map((plot) => {
        const coordinates = normaliseCoordinates(plot.coordinates as unknown)
        if (!coordinates) return null

        return {
          type: 'Feature' as const,
          properties: {
            id: plot.id,
            name: plot.name,
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [coordinates],
          },
        }
      })
      .filter(Boolean)

    return NextResponse.json({
      type: 'FeatureCollection',
      features,
    })
  } catch (error) {
    console.error('Error generating plots GeoJSON:', error)
    return NextResponse.json({ error: 'Failed to generate plots data' }, { status: 500 })
  }
}
