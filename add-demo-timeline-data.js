const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function addDemoTimelineData() {
  console.log('🏗️ Adding demo timeline data centered around today...')
  
  // Today's date - November 26, 2025
  const today = new Date('2025-11-26')
  console.log(`📅 Today's date: ${today.toISOString().split('T')[0]}`)
  
  // Base start date - 2 months before today to show some history
  const baseStartDate = new Date(today)
  baseStartDate.setDate(baseStartDate.getDate() - 60) // Start 60 days ago
  
  // Get all plots with their construction progress and stages
  const plots = await prisma.plot.findMany({
    include: {
      constructionProgress: {
        include: {
          planHistory: true,
          constructionStage: true
        }
      },
      constructionType: {
        include: {
          constructionStages: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      }
    }
  })
  
  console.log(`Found ${plots.length} plots to update`)
  
  // Define varied plot profiles for realistic demo
  const profiles = [
    { type: 'completed', description: '✅ Nearly complete', startOffset: -70, speed: 0.8 },
    { type: 'active', description: '🔨 In active construction', startOffset: -45, speed: 1.0 },
    { type: 'midway', description: '📊 Halfway through', startOffset: -30, speed: 1.1 },
    { type: 'starting', description: '🚀 Just starting', startOffset: -10, speed: 1.0 },
    { type: 'upcoming', description: '📋 Starting soon', startOffset: 5, speed: 1.0 },
    { type: 'delayed', description: '⚠️ Running behind', startOffset: -50, speed: 1.5 },
  ]
  
  for (let i = 0; i < plots.length; i++) {
    const plot = plots[i]
    const profile = profiles[i % profiles.length]
    
    console.log(`\n📍 Updating Plot ${plot.name} - ${profile.description}`)
    
    const stages = plot.constructionType?.constructionStages || []
    if (stages.length === 0) {
      console.log(`   ⚠️ No construction stages, skipping`)
      continue
    }
    
    // Calculate plot start date based on profile
    const plotStartDate = new Date(today)
    plotStartDate.setDate(plotStartDate.getDate() + profile.startOffset)
    
    let currentDate = new Date(plotStartDate)
    const baseStageDuration = 14 // 2 weeks per stage
    
    for (const stage of stages) {
      // Find or create construction progress for this stage
      let progress = plot.constructionProgress.find(
        p => p.constructionStageId === stage.id
      )
      
      // Calculate dates for this stage
      const stageDuration = Math.floor(baseStageDuration * profile.speed) + Math.floor(Math.random() * 7) - 3
      
      const programmeStartDate = new Date(currentDate)
      const programmeEndDate = new Date(currentDate)
      programmeEndDate.setDate(programmeEndDate.getDate() + baseStageDuration)
      
      // Add some variance to planned dates (slight delays from programme)
      const delayDays = Math.floor(Math.random() * 5)
      const plannedStartDate = new Date(programmeStartDate)
      plannedStartDate.setDate(plannedStartDate.getDate() + delayDays)
      const plannedEndDate = new Date(plannedStartDate)
      plannedEndDate.setDate(plannedEndDate.getDate() + stageDuration)
      
      // Determine actual dates based on today's date
      let actualStartDate = null
      let actualEndDate = null
      let completionPercentage = 0
      
      if (plannedStartDate < today) {
        // Stage should have started
        actualStartDate = new Date(plannedStartDate)
        // Add small variance for when it actually started
        actualStartDate.setDate(actualStartDate.getDate() + Math.floor(Math.random() * 3) - 1)
        
        if (plannedEndDate < today) {
          // Stage is complete
          actualEndDate = new Date(plannedEndDate)
          actualEndDate.setDate(actualEndDate.getDate() + Math.floor(Math.random() * 4) - 1)
          completionPercentage = 100
        } else {
          // Stage is in progress
          const totalDays = (plannedEndDate - plannedStartDate) / (1000 * 60 * 60 * 24)
          const daysElapsed = (today - plannedStartDate) / (1000 * 60 * 60 * 24)
          completionPercentage = Math.min(95, Math.floor((daysElapsed / totalDays) * 100) + Math.floor(Math.random() * 10) - 5)
          completionPercentage = Math.max(10, completionPercentage)
        }
      }
      
      // Determine number of plan versions (more for delayed profile)
      const numVersions = profile.type === 'delayed' ? Math.floor(Math.random() * 3) + 2 : Math.floor(Math.random() * 2) + 1
      
      if (progress) {
        // Update existing progress
        await prisma.constructionProgress.update({
          where: { id: progress.id },
          data: {
            programmeStartDate,
            programmeEndDate,
            plannedStartDate,
            plannedEndDate,
            actualStartDate,
            actualEndDate,
            completionPercentage,
            currentPlanVersion: numVersions
          }
        })
        
        // Delete existing plan history
        await prisma.constructionPlanHistory.deleteMany({
          where: { constructionProgressId: progress.id }
        })
        
        // Create plan history
        for (let v = 1; v <= numVersions; v++) {
          const versionDelay = (v - 1) * Math.floor(Math.random() * 5 + 2)
          const versionStart = new Date(programmeStartDate)
          versionStart.setDate(versionStart.getDate() + versionDelay)
          const versionEnd = new Date(versionStart)
          versionEnd.setDate(versionEnd.getDate() + stageDuration + (v - 1) * 2)
          
          // Final version matches current planned dates
          if (v === numVersions) {
            versionStart.setTime(plannedStartDate.getTime())
            versionEnd.setTime(plannedEndDate.getTime())
          }
          
          await prisma.constructionPlanHistory.create({
            data: {
              constructionProgressId: progress.id,
              versionNumber: v,
              plannedStartDate: versionStart,
              plannedEndDate: versionEnd,
              reason: v === 1 ? 'Initial plan' : `Replan due to ${['weather', 'materials', 'labor', 'design change'][Math.floor(Math.random() * 4)]}`,
              changedBy: 'System',
              createdAt: new Date(today.getTime() - (numVersions - v) * 7 * 24 * 60 * 60 * 1000)
            }
          })
        }
        
        console.log(`   ✅ ${stage.name}: ${completionPercentage}% complete`)
      } else {
        // Create new progress record
        const newProgress = await prisma.constructionProgress.create({
          data: {
            plotId: plot.id,
            constructionStageId: stage.id,
            programmeStartDate,
            programmeEndDate,
            plannedStartDate,
            plannedEndDate,
            actualStartDate,
            actualEndDate,
            completionPercentage,
            currentPlanVersion: numVersions
          }
        })
        
        // Create plan history
        for (let v = 1; v <= numVersions; v++) {
          await prisma.constructionPlanHistory.create({
            data: {
              constructionProgressId: newProgress.id,
              versionNumber: v,
              plannedStartDate: v === numVersions ? plannedStartDate : programmeStartDate,
              plannedEndDate: v === numVersions ? plannedEndDate : programmeEndDate,
              reason: v === 1 ? 'Initial plan' : 'Schedule adjustment',
              changedBy: 'System',
              createdAt: new Date(today.getTime() - (numVersions - v) * 7 * 24 * 60 * 60 * 1000)
            }
          })
        }
        
        console.log(`   ✨ Created ${stage.name}: ${completionPercentage}%`)
      }
      
      // Move to next stage
      currentDate = new Date(programmeEndDate)
      currentDate.setDate(currentDate.getDate() + 1)
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('✅ Demo timeline data added successfully!')
  console.log('='.repeat(60))
  console.log('📅 Timeline is now centered around: ' + today.toLocaleDateString('en-GB'))
  console.log('🏗️ Each plot has a different profile:')
  profiles.forEach(p => console.log(`   ${p.description}`))
  console.log('📊 Stages show realistic completion percentages')
  console.log('📝 Plan history shows version changes')
  console.log('='.repeat(60))
}

addDemoTimelineData()
  .catch((e) => {
    console.error('❌ Error adding demo timeline data:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

