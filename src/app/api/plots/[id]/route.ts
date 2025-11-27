import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
type Params = { id: string }

async function resolveParams(paramsPromise: Promise<Params>) {
  return paramsPromise
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id } = await resolveParams(params)
    const plot = await prisma.plot.findUnique({
      where: { id },
      include: { map: true },
    })

    if (!plot) {
      return NextResponse.json({ error: 'Plot not found' }, { status: 404 })
    }

    return NextResponse.json(plot)
  } catch (error) {
    console.error('Error fetching plot:', error)
    return NextResponse.json({ error: 'Failed to fetch plot' }, { status: 500 })
  }
}
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id } = await resolveParams(params)
    const body = await request.json()

    let mapIdToUse: string | undefined = body.mapId

    if (!mapIdToUse && body.mapSlug) {
      const map = await prisma.map.findUnique({
        where: { slug: body.mapSlug },
        select: { id: true },
      })

      if (!map) {
        return NextResponse.json({ error: 'Map not found' }, { status: 404 })
      }

      mapIdToUse = map.id
    }

    const plot = await prisma.plot.update({
      where: { id },
      data: {
        mapId: mapIdToUse,
        name: body.name,
        description: body.description,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        contractor: body.contractor,
        notes: body.notes,
        latitude: body.latitude,
        longitude: body.longitude,
        coordinates: body.coordinates ?? null,
        // Extended fields
        streetAddress: body.streetAddress,
        homebuilderId: body.homebuilderId,
        constructionTypeId: body.constructionTypeId,
        unitTypeId: body.unitTypeId,
        numberOfBeds: body.numberOfBeds,
        numberOfStoreys: body.numberOfStoreys,
        squareFootage: body.squareFootage,
        minimumSalePrice: body.minimumSalePrice,
      },
    })

    return NextResponse.json(plot)
  } catch (error) {
    console.error('Error updating plot:', error)
    return NextResponse.json({ error: 'Failed to update plot' }, { status: 500 })
  }
}
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id } = await resolveParams(params)
    await prisma.plot.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Plot deleted successfully' })
  } catch (error) {
    console.error('Error deleting plot:', error)
    return NextResponse.json({ error: 'Failed to delete plot' }, { status: 500 })
  }
}
