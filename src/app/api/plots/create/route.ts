import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Plot } from '@prisma/client'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      name, 
      coordinates, 
      mapId, 
      mapSlug, 
      existingPlotId,
      streetAddress,
      homebuilderId,
      constructionTypeId,
      unitTypeId,
      numberOfBeds,
      numberOfStoreys,
      squareFootage,
      minimumSalePrice,
      description,
      contractor,
      notes
    } = body

    if (!coordinates || !Array.isArray(coordinates)) {
      return NextResponse.json({ error: 'Coordinates are required' }, { status: 400 })
    }

    let resolvedMapId = mapId as string | undefined

    if (!resolvedMapId && mapSlug) {
      const map = await prisma.map.findUnique({
        where: { slug: mapSlug },
        select: { id: true },
      })

      if (!map) {
        return NextResponse.json({ error: 'Map not found' }, { status: 404 })
      }

      resolvedMapId = map.id
    }

    if (!resolvedMapId) {
      return NextResponse.json({ error: 'mapId or mapSlug is required' }, { status: 400 })
    }

    const centerX = coordinates.reduce((sum, point) => sum + point[0], 0) / coordinates.length
    const centerY = coordinates.reduce((sum, point) => sum + point[1], 0) / coordinates.length

    let plot: Plot

    if (existingPlotId) {
      // Update existing plot with polygon data
      plot = await prisma.plot.update({
        where: { id: existingPlotId },
        data: {
          coordinates,
          latitude: centerY,
          longitude: centerX,
          // Update other fields if provided
          streetAddress: streetAddress || undefined,
          homebuilderId: homebuilderId || undefined,
          constructionTypeId: constructionTypeId || undefined,
          unitTypeId: unitTypeId || undefined,
          numberOfBeds: numberOfBeds || undefined,
          numberOfStoreys: numberOfStoreys || undefined,
          squareFootage: squareFootage || undefined,
          minimumSalePrice: minimumSalePrice || undefined,
          description: description || undefined,
          contractor: contractor || undefined,
          notes: notes || undefined,
        },
      })
    } else {
      // Create new plot
      if (!name) {
        return NextResponse.json({ error: 'Name is required for new plots' }, { status: 400 })
      }

      plot = await prisma.plot.create({
        data: {
          mapId: resolvedMapId,
          name,
          coordinates,
          latitude: centerY,
          longitude: centerX,
          streetAddress: streetAddress || undefined,
          homebuilderId: homebuilderId || undefined,
          constructionTypeId: constructionTypeId || undefined,
          unitTypeId: unitTypeId || undefined,
          numberOfBeds: numberOfBeds || undefined,
          numberOfStoreys: numberOfStoreys || undefined,
          squareFootage: squareFootage || undefined,
          minimumSalePrice: minimumSalePrice || undefined,
          description: description || undefined,
          contractor: contractor || undefined,
          notes: notes || undefined,
        },
      })

      // If a construction type is specified, create progress records for all stages
      if (constructionTypeId) {
        const constructionStages = await prisma.constructionStage.findMany({
          where: { constructionTypeId },
          orderBy: { sortOrder: 'asc' }
        })

        if (constructionStages.length > 0) {
          const progressRecords = constructionStages.map((stage: any) => ({
            plotId: plot.id,
            constructionStageId: stage.id,
            completionPercentage: 0,
            currentPlanVersion: 1
          }))

          await prisma.constructionProgress.createMany({
            data: progressRecords
          })
        }
      }
    }

    return NextResponse.json(plot)
  } catch (error) {
    console.error('Error creating/updating plot:', error)
    return NextResponse.json({ error: 'Failed to create/update plot' }, { status: 500 })
  }
}
